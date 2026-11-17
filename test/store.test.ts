import { afterEach, describe, expect, test } from "bun:test";
import {
  backToForm,
  duty,
  dutyProgress,
  dutyStatus,
  fetchAllDuty,
  form,
  index,
  loadError,
  loadFile,
  loadPasted,
  overrides,
  warnings,
  workbook,
} from "../src/app/store";
import { workbookFile } from "./fixtures";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("duty lookup vs. file changes", () => {
  test("a lookup for the previous file is discarded when another file loads mid-run", async () => {
    await loadFile(
      workbookFile([
        { B: 1, K: "9403", D: "statue of marble" },
        { B: 2, K: "7318", D: "x" },
      ]),
    );
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) await loadFile(workbookFile([{ B: 1, K: "1111", D: "other" }]));
      return new Response(JSON.stringify({ status: "no-data", hsn: "9403" }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await fetchAllDuty();

    expect(calls).toBe(1);
    expect(duty.value).toEqual({});
    expect(dutyProgress.value).toBeNull();
  });
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("loading and lookups", () => {
  test("a bad file keeps the current workbook and does not cancel its running lookup", async () => {
    await loadFile(workbookFile([{ B: 1, K: "9403", D: "x" }], "good.xlsx"));
    const good = workbook.value;
    globalThis.fetch = (async () => {
      await loadFile(new File(["not a sheet"], "broken.xlsx"));
      return jsonResponse({ status: "no-data", hsn: "9403" });
    }) as unknown as typeof fetch;

    await fetchAllDuty();

    expect(workbook.value).toBe(good);
    expect(loadError.value).toContain("broken.xlsx");
    expect(dutyStatus.value).toEqual({ "9403": "no-data" });
  });

  test("results appear as each code finishes, and a failed refetch keeps the earlier answer", async () => {
    await loadFile(workbookFile([{ B: 1, K: "9403", D: "x" }], "again.xlsx"));
    const ok = { status: "ok", hsn: "9403", uqc: "NOS", dbk: [], rodetep: [] };
    globalThis.fetch = (async () => jsonResponse(ok)) as unknown as typeof fetch;
    await fetchAllDuty();
    expect(duty.value["9403"]?.uqc).toBe("NOS");

    globalThis.fetch = (async () =>
      jsonResponse({ error: "invalid HSN code" }, 400)) as unknown as typeof fetch;
    await fetchAllDuty();
    expect(dutyStatus.value["9403"]).toBe("failed");
    expect(duty.value["9403"]?.uqc).toBe("NOS");
  });

  test("a client error is not retried", async () => {
    await loadFile(workbookFile([{ B: 1, K: "9403", D: "x" }], "retry.xlsx"));
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse({ error: "invalid HSN code" }, 400);
    }) as unknown as typeof fetch;
    await fetchAllDuty();
    expect(calls).toBe(1);
  });

  test("warnings say when duty data is missing or rows have no HSN", async () => {
    await loadFile(
      workbookFile(
        [
          { B: 1, K: "9403", D: "x" },
          { B: 2, D: "no hsn" },
        ],
        "warn.xlsx",
      ),
    );
    expect(warnings.value.some((w) => w.includes("not fetched yet"))).toBe(true);
    expect(warnings.value.some((w) => w.includes("no HSN code"))).toBe(true);
  });
});

describe("HSN typed in the review table", () => {
  test("is counted at once, and looked up when going back to the form", async () => {
    await loadFile(workbookFile([{ B: 1, D: "statue of marble", M: 5, N: "NOS" }], "typed.xlsx"));
    expect(index.value?.rowsByRitc).toEqual({});
    expect(warnings.value.some((w) => w.includes("no HSN code"))).toBe(true);

    const asked: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      asked.push(JSON.parse(String(init?.body)).hsn);
      return jsonResponse({ status: "ok", hsn: "9403", uqc: "NOS", dbk: [], rodetep: [] });
    }) as unknown as typeof fetch;

    overrides.value = { K2: "9403" };
    expect(index.value?.rowsByRitc).toEqual({ "9403": [2] });
    expect(index.value?.blankRitcRows).toBe(0);
    expect(warnings.value.some((w) => w.includes("no HSN code"))).toBe(false);
    expect(asked).toEqual([]);

    await backToForm();
    expect(asked).toEqual(["9403"]);
    expect(dutyStatus.value["9403"]).toBe("ok");
    expect(duty.value["9403"]?.uqc).toBe("NOS");
  });

  test("going back looks up only the HSN typed in review, not codes the file already had", async () => {
    await loadFile(workbookFile([{ B: 1, D: "x", K: "9403" }], "scope.xlsx"));
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse({ status: "ok", hsn: "9403", uqc: "NOS", dbk: [], rodetep: [] });
    }) as unknown as typeof fetch;

    await backToForm();
    expect(calls).toBe(0);
  });

  test("an HSN typed while a lookup is running is looked up when that lookup ends", async () => {
    await loadFile(
      workbookFile(
        [
          { B: 1, D: "x", K: "7318" },
          { B: 2, D: "y" },
        ],
        "busy.xlsx",
      ),
    );
    const asked: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const hsn: string = JSON.parse(String(init?.body)).hsn;
      asked.push(hsn);
      if (hsn === "7318") await gate;
      return jsonResponse({ status: "ok", hsn, uqc: "NOS", dbk: [], rodetep: [] });
    }) as unknown as typeof fetch;

    const running = fetchAllDuty();
    while (!asked.includes("7318")) await new Promise((resolve) => setTimeout(resolve, 0));
    overrides.value = { K3: "9403" };
    await backToForm();
    release();
    await running;

    expect(asked).toEqual(["7318", "9403"]);
    expect(dutyStatus.value["9403"]).toBe("ok");
  });

  test("going back again does not repeat a lookup that already has an answer", async () => {
    await loadFile(workbookFile([{ B: 1, D: "x" }], "again-back.xlsx"));
    overrides.value = { K2: "9403" };
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse({ status: "ok", hsn: "9403", uqc: "NOS", dbk: [], rodetep: [] });
    }) as unknown as typeof fetch;

    await backToForm();
    await backToForm();
    expect(calls).toBe(1);
  });
});

describe("pasted tables", () => {
  test("a pasted table replaces the workbook and prefills the form", async () => {
    await loadFile(workbookFile([{ B: 1, K: "9403", D: "old" }], "old.xlsx"));
    await loadPasted("ItemSNo\tDescription\tHSN\tScheme\n1\tBicycle mirror\t7009\t19-Drawback (DBK)");

    expect(workbook.value?.fileName).toBe("Pasted table.xlsx");
    expect(workbook.value?.index.rowsByRitc).toEqual({ "7009": [2] });
    expect(form.value.scheme).toBe("19-Drawback (DBK)");
    expect(loadError.value).toBeNull();
  });

  test("a bad paste keeps the current workbook and reports why", async () => {
    await loadFile(workbookFile([{ B: 1, K: "9403", D: "keep" }], "keep.xlsx"));
    const good = workbook.value;
    await loadPasted("1\tmirror\t7009");

    expect(workbook.value).toBe(good);
    expect(loadError.value).toContain("No column names");
  });
});
