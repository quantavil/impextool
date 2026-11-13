import { describe, expect, test } from "bun:test";
import { applyPicks, buildDbkPlan } from "../src/core/duty";
import { fillWorkbook } from "../src/core/fill";
import { fillAndBuild, openWorkbook, outputName } from "../src/io/workbook";
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
});
