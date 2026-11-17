import { describe, expect, test } from "bun:test";
import XLSX from "xlsx-js-style";
import { applyPicks, buildDbkPlan } from "../src/core/duty";
import { fillWorkbook } from "../src/core/fill";
import { fillAndBuild, openPastedTable, openWorkbook, outputName } from "../src/io/workbook";
import { DUTY, workbookFile } from "./fixtures";

const SHIPMENT = {
  scheme: "19-Drawback (DBK)",
  endUse: "GNX100",
  reward: "No",
  rodtep: "Yes",
  state: "",
  district: "",
  country: "",
  paymentStatus: "LUT",
  currency: null,
  igstPercent: {},
  duty: DUTY,
};

describe("workbook round trip", () => {
  test("opens, fills, writes and re-reads an xlsx file", async () => {
    const loaded = await openWorkbook(
      workbookFile([{ B: 1, D: "statue of marble", K: "9403", M: 5, N: "NOS" }]),
    );
    expect(loaded.index.dataRows).toEqual([2]);
    expect(loaded.index.rowsByRitc).toEqual({ "9403": [2] });

    const plan = applyPicks(buildDbkPlan(loaded.index.rowsByRitc, DUTY, loaded.sheet), {});
    const { blob, result } = fillAndBuild(loaded, (sheet, rows) =>
      fillWorkbook(sheet, rows, { ...SHIPMENT, plan }),
    );
    expect(result.matched).toBe(1);

    const reopened = await openWorkbook(new File([await blob.arrayBuffer()], "out.xlsx"));
    expect(reopened.sheet.get("L2")).toBe("19-Drawback (DBK)");
    expect(reopened.sheet.get("U2")).toBe("10");
    expect(reopened.sheet.get("W2")).toBe(1.5);
  });

  test("every formula in the download carries its result, so ImpexCube can read it", async () => {
    const loaded = await openWorkbook(
      workbookFile([{ B: 1, D: "statue of marble", K: "9403", M: 5, N: "NOS" }]),
    );
    const plan = applyPicks(buildDbkPlan(loaded.index.rowsByRitc, DUTY, loaded.sheet), {});
    const { blob } = fillAndBuild(loaded, (sheet, rows) => fillWorkbook(sheet, rows, { ...SHIPMENT, plan }));

    const raw = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array", cellFormula: true });
    const sheet = raw.Sheets.Sheet1 ?? {};
    const formulas = Object.keys(sheet).filter((a) => sheet[a]?.f !== undefined);
    expect(formulas).toContain("O2");
    expect(formulas.filter((a) => sheet[a]?.v === undefined)).toEqual([]);
    expect(sheet.O2?.v).toBe(5);
    expect(sheet.AK2?.v).toBe(5);
  });

  test("an HSN typed as an override is written with its duty, not only shown in the file", async () => {
    const loaded = await openWorkbook(workbookFile([{ B: 1, D: "statue of marble", M: 5, N: "NOS" }]));
    const overrides = { K2: "9403" };
    const plan = applyPicks(buildDbkPlan({ "9403": [2] }, DUTY, loaded.sheet), {});
    const { blob, result } = fillAndBuild(
      loaded,
      (sheet, rows) => fillWorkbook(sheet, rows, { ...SHIPMENT, plan }),
      {
        overrides,
      },
    );
    expect(result.matched).toBe(1);

    const reopened = await openWorkbook(new File([await blob.arrayBuffer()], "typed-hsn.xlsx"));
    expect(reopened.sheet.get("K2")).toBe("9403");
    expect(reopened.sheet.get("L2")).toBe("19-Drawback (DBK)");
    expect(reopened.sheet.get("U2")).toBe("10");
  });

  test("applying twice starts from the original file, so a cleared choice does not keep an old value", async () => {
    const loaded = await openWorkbook(workbookFile([{ B: 1, D: "x", K: "7318", AD: "FILE-STATE" }]));
    const run = (state: string) =>
      fillAndBuild(loaded, (sheet, rows) => fillWorkbook(sheet, rows, { ...SHIPMENT, state, plan: {} })).blob;

    const first = await openWorkbook(new File([await run("27").arrayBuffer()], "a.xlsx"));
    expect(first.sheet.get("AD2")).toBe("27");
    const second = await openWorkbook(new File([await run("").arrayBuffer()], "b.xlsx"));
    expect(second.sheet.get("AD2")).toBe("FILE-STATE");
    expect(loaded.sheet.get("AD2")).toBe("FILE-STATE");
  });

  test("the template's RoDTEPQty column is kept in the output", async () => {
    const book = await openWorkbook(
      workbookFile([{ B: 1, D: "x", K: "7318", AK: "=O2" }], "a.xlsx", { AK1: "RoDTEPQty" }),
    );
    const out = fillAndBuild(book, () => null).blob;
    const reopened = await openWorkbook(new File([await out.arrayBuffer()], "out.xlsx"));
    expect(reopened.sheet.get("AK1")).toBe("RoDTEPQty");
    expect(reopened.sheet.get("AK2")).toBeDefined();
  });

  test("the output name uses local date and time together", () => {
    const at = new Date(2026, 10, 9, 0, 5, 7);
    expect(outputName("ProductFormat.xlsx", at)).toBe("ProductFormat_Filled_2026-11-09_000507.xlsx");
  });

  test("an empty data column is rejected with a clear message", async () => {
    await expect(openWorkbook(workbookFile([{ D: "no item number", K: "9403" }]))).rejects.toThrow(
      "No data rows",
    );
  });

  test("numeric HSN cells raise a leading-zero warning", async () => {
    const loaded = await openWorkbook(workbookFile([{ B: 1, K: 101, D: "x" }]));
    expect(loaded.warnings.some((w) => w.includes("stored as numbers"))).toBe(true);
  });

  test("a pasted table opens as a workbook and fills like an upload", async () => {
    const loaded = openPastedTable("Description\tHSN\tQty\tUnit\tFOB\nBicycle mirror\t7009\t10\tNOS\t2500");
    expect(loaded.fileName).toBe("Pasted table.xlsx");
    expect(loaded.index.dataRows).toEqual([2]);
    expect(loaded.index.rowsByRitc).toEqual({ "7009": [2] });
    expect(loaded.sheet.get("B2")).toBe("1");
    expect(loaded.sheet.get("D2")).toBe("Bicycle mirror");
    expect(loaded.sheet.get("K2")).toBe("7009");
    expect(loaded.sheet.get("M2")).toBe(10);
    expect(loaded.sheet.get("R2")).toBe(2500);
    expect(loaded.warnings.some((w) => w.includes("Guidelines"))).toBe(false);

    const { blob } = fillAndBuild(loaded, (sheet, rows) =>
      fillWorkbook(sheet, rows, { ...SHIPMENT, plan: {} }),
    );
    const reopened = await openWorkbook(new File([await blob.arrayBuffer()], "out.xlsx"));
    expect(reopened.sheet.get("L2")).toBe("19-Drawback (DBK)");
    expect(reopened.sheet.get("J2")).toBe("LUT");
    expect(reopened.sheet.get("AL2")).toBeUndefined();
  });

  test("formatted numbers in a pasted table are stored as numbers", () => {
    const loaded = openPastedTable("HSN\tQty\tFOB\n7009\t1,000\t2,500.50");
    expect(loaded.sheet.get("M2")).toBe(1000);
    expect(loaded.sheet.get("R2")).toBe(2500.5);
    expect(loaded.sheet.get("K2")).toBe("7009");
  });

  test("a pasted table without an HSN column is rejected with a clear message", () => {
    expect(() => openPastedTable("Description\tQty\nmirror\t10")).toThrow("No HSN column");
  });
});
