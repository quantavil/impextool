import { afterEach, describe, expect, test } from "bun:test";
import {
  duty,
  dutyProgress,
  dutyStatus,
  fetchAllDuty,
  loadError,
  loadFile,
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
