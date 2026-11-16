import { beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import type { Option } from "../src/data/geo";
import { DUTY, workbookFile } from "./fixtures";

/** Exposes happy-dom's DOM classes as globals so Preact can render into them. */
function installDom(): void {
  const win = new Window({ url: "http://localhost/" });
  const g = globalThis as unknown as Record<string, unknown>;
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "DocumentFragment",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "getComputedStyle",
  ]) {
    try {
      g[key] = key === "window" ? win : (win as unknown as Record<string, unknown>)[key];
    } catch {
      // Some globals are read-only in Bun; Preact only needs the ones above.
    }
  }
}

beforeAll(installDom);

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("app shell", () => {
  test("renders, loads a workbook through the upload path, and prefills the shipment", async () => {
    const { App } = await import("../src/app/App");
    const { blockers, form, loadFile, logLines, workbook } = await import("../src/app/store");
    // Other test files share this module state, so start from the empty landing screen.
    workbook.value = null;
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<App />, root);
    await tick();

    expect(root.textContent).toContain("ImpexTool");
    expect(root.textContent).toContain("Drop ProductFormat.xlsx here");
    expect(blockers.value.map((b) => b.message)).toEqual([
      "Upload a ProductFormat.xlsx file or paste a table.",
    ]);

    await loadFile(
      workbookFile([
        {
          B: 1,
          D: "statue of marble",
          K: "9403",
          L: "19-Drawback (DBK)",
          E: "GNX100",
          I: "No",
          AJ: "No",
          J: "LUT",
        },
      ]),
    );
    await tick();

    expect(logLines.value.some((l) => l.message.startsWith("Parsed ProductFormat.xlsx: 1 row(s)"))).toBe(
      true,
    );
    expect(form.value.scheme).toBe("19-Drawback (DBK)");
    expect(blockers.value.some((b) => b.id === "scheme")).toBe(false);
  });

  test("Apply with missing fields flags them in place instead of staying silently disabled", async () => {
    const { App } = await import("../src/app/App");
    const { loadFile, showErrors, setField } = await import("../src/app/store");
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<App />, root);
    await loadFile(workbookFile([{ B: 1, D: "x", K: "7318" }]));
    await tick();
    setField("scheme", "");
    setField("reward", "");
    await tick();

    const apply = [...root.querySelectorAll("button")].find((b) => b.textContent === "Apply and fill");
    if (!apply) throw new Error("Apply button not found");
    expect(apply.hasAttribute("disabled")).toBe(false);
    expect(root.querySelector(".field-msg.err")).toBeNull();

    apply.click();
    await tick();

    expect(showErrors.value).toBe(true);
    const errors = [...root.querySelectorAll(".field-msg.err")].map((e) => e.textContent);
    expect(errors).toContain("Choose a Scheme Code.");
    expect(errors).toContain("Choose Reward Item (Yes / No).");
  });

  test("a file that is not a spreadsheet shows an error next to the upload", async () => {
    const { App } = await import("../src/app/App");
    const { loadFile } = await import("../src/app/store");
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<App />, root);
    await loadFile(new File(["x"], "notes.pdf"));
    await tick();
    expect(root.querySelector(".alert.err")?.textContent).toContain("notes.pdf is not a spreadsheet");
  });
});

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
const type = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const COUNTRIES: Option[] = [
  { value: "IN", label: "India (IN)" },
  { value: "US", label: "United States (US)" },
  { value: "AE", label: "United Arab Emirates (AE)", detail: "Gulf" },
];

describe("paste instead of upload", () => {
  async function mountLanding() {
    const { App } = await import("../src/app/App");
    const st = await import("../src/app/store");
    st.workbook.value = null;
    st.loadError.value = null;
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<App />, root);
    await tick();
    const open = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "paste a table copied from Excel",
    );
    if (!open) throw new Error("paste link not found");
    open.click();
    await tick();
    const box = root.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!box) throw new Error("paste box not found");
    return { root, st, box };
  }

  test("a copied table loads from the landing screen", async () => {
    const { root, st, box } = await mountLanding();
    type(box, "ItemSNo\tDescription\tHSN\tQty\tUnit\n1\tBicycle mirror\t7009\t10\tNOS");
    await tick();

    expect(root.querySelector("#paste-status")?.textContent).toContain("1 row(s)");
    expect(root.querySelector("#paste-status")?.textContent).toContain("HSN");
    const use = [...root.querySelectorAll("button")].find((b) => b.textContent === "Use pasted table");
    if (!use) throw new Error("use button not found");
    expect(use.hasAttribute("disabled")).toBe(false);
    use.click();
    await tick();
    await tick();

    expect(st.workbook.value?.fileName).toBe("Pasted table.xlsx");
    expect(st.workbook.value?.index.rowsByRitc).toEqual({ "7009": [2] });
    expect(root.querySelector("#sec-shipment")).not.toBeNull();
  });

  test("a table without an HSN column shows the problem and stays disabled", async () => {
    const { root, box } = await mountLanding();
    type(box, "Description\tQty\nmirror\t10");
    await tick();

    expect(root.querySelector("#paste-status")?.textContent).toContain("No HSN column");
    const use = [...root.querySelectorAll("button")].find((b) => b.textContent === "Use pasted table");
    expect(use?.hasAttribute("disabled")).toBe(true);
  });
});

describe("combobox", () => {
  async function mount(props: Partial<{ value: string; freeText: boolean; showDetail: boolean }> = {}) {
    const { Combobox } = await import("../src/app/ui");
    const changes: string[] = [];
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(
      <Combobox
        id="c"
        label="Country"
        value={props.value ?? ""}
        options={COUNTRIES}
        freeText={props.freeText}
        showDetail={props.showDetail}
        onChange={(v) => changes.push(v)}
      />,
      root,
    );
    await tick();
    const input = root.querySelector("input") as HTMLInputElement;
    return { root, input, changes };
  }
  const labels = (root: Element) => [...root.querySelectorAll("[role=option]")].map((o) => o.textContent);

  test("opens on focus, filters as you type (label, code or detail), and Enter picks the highlighted match", async () => {
    const { root, input, changes } = await mount();
    input.focus();
    await tick();
    expect(labels(root)).toHaveLength(3);

    type(input, "united");
    await tick();
    expect(labels(root)).toEqual(["United States (US)", "United Arab Emirates (AE)Gulf"]);

    type(input, "gulf");
    await tick();
    expect(labels(root)).toEqual(["United Arab Emirates (AE)Gulf"]);

    key(input, "Enter");
    await tick();
    expect(changes).toEqual(["AE"]);
    expect(root.querySelector("[role=listbox]")).toBeNull();
  });

  test("arrow keys move through matches and Escape closes without changing anything", async () => {
    const { root, input, changes } = await mount();
    input.focus();
    await tick();
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    await tick();
    expect(input.getAttribute("aria-activedescendant")).toBe("c-opt-2");
    key(input, "Escape");
    await tick();
    expect(root.querySelector("[role=listbox]")).toBeNull();
    expect(changes).toEqual([]);
  });

  test("a value from the file that is not in the list stays visible", async () => {
    const { input } = await mount({ value: "ZZ" });
    expect(input.value).toBe("ZZ (from file)");
  });

  test("showDetail keeps the chosen description beside the value until the list opens", async () => {
    const { root, input } = await mount({ value: "AE", showDetail: true });
    expect(root.querySelector(".combo-shown-label")?.textContent).toBe("United Arab Emirates (AE)");
    const detail = root.querySelector(".combo-shown-detail");
    expect(detail?.textContent).toBe("Gulf");
    expect(input.getAttribute("title")).toBe("United Arab Emirates (AE) — Gulf");

    input.focus();
    await tick();
    expect(root.querySelector(".combo-shown")).toBeNull();
  });

  test("showDetail is off unless asked for, so other lists keep the plain value", async () => {
    const { root } = await mount({ value: "AE" });
    expect(root.querySelector(".combo-shown")).toBeNull();
  });

  test("free text keeps what was typed on Enter instead of swapping in the first suggestion", async () => {
    const { input, changes } = await mount({ freeText: true });
    input.focus();
    type(input, "in");
    await tick();
    key(input, "Enter");
    await tick();
    expect(changes).toEqual(["in"]);
  });

  test("free text: the first ArrowDown highlights the first suggestion and Enter picks it", async () => {
    const { root, input, changes } = await mount({ freeText: true });
    input.focus();
    await tick();
    expect(root.querySelector(".combo-opt.active")).toBeNull();
    key(input, "ArrowDown");
    await tick();
    key(input, "Enter");
    await tick();
    expect(changes).toEqual(["IN"]);
  });
});

describe("HSN drawback", () => {
  test("the chosen entry shows its description without an SR prefix", async () => {
    const { App } = await import("../src/app/App");
    const st = await import("../src/app/store");
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<App />, root);
    await st.loadFile(workbookFile([{ B: 1, D: "bolt", K: "9403", M: 5, N: "KGS" }]));
    st.duty.value = DUTY;
    st.setField("scheme", "19-Drawback (DBK)");
    st.setField("reward", "No");
    st.setField("rodtep", "Yes");
    st.setField("paymentStatus", "LUT");
    await tick();

    const cell = root.querySelector("#sec-hsn .dbk-cell");
    expect(cell?.querySelector(".combo-shown-label")?.textContent).toBe("12 · 0.5");
    expect(cell?.querySelector(".combo-shown-detail")?.textContent).toBe("Others");

    const input = cell?.querySelector("input") as HTMLInputElement | null;
    if (!input) throw new Error("drawback combobox not found");
    input.focus();
    await tick();
    const labels = [...(cell?.querySelectorAll("[role=option]") ?? [])].map((o) => o.textContent);
    expect(labels).toHaveLength(3);
    expect(labels.every((label) => !label?.startsWith("SR "))).toBe(true);
  });
});

describe("segmented", () => {
  test("arrow keys move the choice, like native radios", async () => {
    const { Segmented } = await import("../src/app/ui");
    const changes: string[] = [];
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(
      <Segmented
        id="r"
        label="Reward"
        value="Yes"
        options={[
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
        ]}
        onChange={(v) => changes.push(v)}
      />,
      root,
    );
    await tick();
    const [yes] = root.querySelectorAll("[role=radio]");
    if (!yes) throw new Error("radio not found");
    expect(yes.getAttribute("aria-checked")).toBe("true");
    key(yes, "ArrowRight");
    expect(changes).toEqual(["No"]);
  });
});

describe("review result", () => {
  const readSheet = async (blob: Blob) => {
    const { default: XLSX } = await import("xlsx-js-style");
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", cellFormula: true, sheetStubs: true });
    const ws = wb.Sheets.Sheet1;
    if (!ws) throw new Error("Sheet1 missing");
    return ws;
  };

  /** Loads a small workbook, chooses a scheme and payment status, and applies the fill. */
  async function filled(root: Element) {
    const { App } = await import("../src/app/App");
    const st = await import("../src/app/store");
    render(<App />, root);
    await st.loadFile(workbookFile([{ B: 1, D: "bolt", K: "7318", M: 5, N: "KGS" }]));
    st.duty.value = DUTY;
    st.setField("scheme", "19-Drawback (DBK)");
    st.setField("reward", "No");
    st.setField("rodtep", "Yes");
    st.setField("paymentStatus", "LUT");
    return st;
  }
  const mount = () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
  };

  test("the review view replaces the form after a fill, and Back to form restores it with edits kept", async () => {
    const root = mount();
    const st = await filled(root);
    await tick();
    expect(root.querySelector("#sec-review")).toBeNull();
    expect(root.querySelector("#sec-shipment")).not.toBeNull();
    const labels = () => [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels()).not.toContain("Apply again");

    await st.applyFill();
    await tick();
    expect(root.querySelector("#sec-review h2")?.textContent).toBe("Review result");
    expect(root.querySelector('input[aria-label="K row 2"]')).not.toBeNull();
    expect(root.querySelector("#sec-shipment")).toBeNull();
    expect(root.querySelector("#sec-hsn")).toBeNull();
    expect(labels()).toContain("Apply and fill");
    expect(labels()).not.toContain("Apply again");

    st.setOverride("W2", "4");
    await st.outputSettled();
    const back = [...root.querySelectorAll("button")].find((b) => b.textContent === "Back to form");
    if (!back) throw new Error("Back to form not found");
    back.click();
    await tick();
    expect(root.querySelector("#sec-review")).toBeNull();
    expect(root.querySelector("#sec-shipment")).not.toBeNull();
    expect(st.form.value.scheme).toBe("19-Drawback (DBK)");
    expect(st.overrides.value).toEqual({ W2: "4" });

    // Clicking Apply and fill again swaps back to the review view with the edit still applied.
    const apply = [...root.querySelectorAll("button")].find((b) => b.textContent === "Apply and fill");
    apply?.click();
    await tick();
    await tick();
    expect(root.querySelector("#sec-review")).not.toBeNull();
    expect((root.querySelector('input[aria-label="W row 2"]') as HTMLInputElement).value).toBe("4");
  });

  test("an edit typed in the table reaches the file, and Reset removes it", async () => {
    const root = mount();
    const st = await filled(root);
    await st.applyFill();
    await tick();

    const input = root.querySelector('input[aria-label="W row 2"]') as HTMLInputElement;
    type(input, "2.5");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await st.outputSettled();
    expect(st.overrides.value).toEqual({ W2: "2.5" });
    expect(root.querySelector("#sec-review")?.textContent).toContain("1 manual edit kept");
    expect((await readSheet(st.output.value as Blob)).W2?.v).toBe(2.5);

    const reset = root.querySelector('button[aria-label="Reset W row 2"]') as HTMLButtonElement;
    reset.click();
    await tick();
    await st.outputSettled();
    expect(st.overrides.value).toEqual({});
    expect(root.querySelector("#sec-review")?.textContent).not.toContain("manual edit");
    expect((await readSheet(st.output.value as Blob)).W2).toBeUndefined();
  });

  test("manual edits survive a repeat fill and win over the fill", async () => {
    const root = mount();
    const st = await filled(root);
    await st.applyFill();
    // AJ is filled with Yes/N/A; the user replaces it, and the scheme stays what the fill wrote.
    st.setOverride("AJ2", "7");
    st.setOverride("L2", "");
    await st.outputSettled();
    expect(st.review.value?.after.AJ2).toBe("N/A");

    await st.applyFill();
    expect(st.overrides.value).toEqual({ AJ2: "7", L2: "" });
    const ws = await readSheet(st.output.value as Blob);
    expect(ws.AJ2?.v).toBe(7);
    expect(ws.AJ2?.f).toBeUndefined();
    expect(ws.L2).toBeUndefined();
    // Cells without an edit still come from the fill.
    expect(ws.J2?.v).toBe("LUT");
  });

  test("an override can be a formula, and an edit equal to the filled value is dropped", async () => {
    const root = mount();
    const st = await filled(root);
    await st.applyFill();
    st.setOverride("V2", "=M2*2");
    st.setOverride("J2", "LUT");
    await st.outputSettled();
    expect(st.overrides.value).toEqual({ V2: "=M2*2" });
    expect((await readSheet(st.output.value as Blob)).V2?.f).toBe("M2*2");
  });

  test("loading another file drops the edits and the table", async () => {
    const root = mount();
    const st = await filled(root);
    await st.applyFill();
    st.setOverride("W2", "1");
    await st.loadFile(workbookFile([{ B: 1, D: "other", K: "7318" }], "next.xlsx"));
    expect(st.overrides.value).toEqual({});
    expect(st.review.value).toBeNull();
  });
});
