import { describe, expect, test } from "bun:test";
import { analyzePaste, pastedNumber } from "../src/core/paste";

describe("pasted tables", () => {
  test("columns match by header text, ignoring case, spaces and punctuation", () => {
    const table = analyzePaste(
      "Item S.No\tDescription\tHSN Code\tQty\tUQC\tFOB\n1\tBicycle mirror\t7009\t10\tNOS\t2500",
    );
    expect(table.error).toBeNull();
    expect(table.columns.map((c) => c.key)).toEqual([
      "itemSno",
      "description",
      "ritc",
      "quantity",
      "qtyUnit",
      "fob",
    ]);
    expect(table.rows).toEqual([["1", "Bicycle mirror", "7009", "10", "NOS", "2500"]]);
    expect(table.ignored).toEqual([]);
  });

  test("a table without ItemSNo is numbered instead of rejected", () => {
    const table = analyzePaste("Description\tRITCCode\nmirror\t7009\nframe\t8714");
    expect(table.error).toBeNull();
    expect(table.columns.map((c) => c.label)).toEqual(["ItemSNo", "Description", "HSN"]);
    expect(table.rows).toEqual([
      ["1", "mirror", "7009"],
      ["2", "frame", "8714"],
    ]);
  });

  test("a blank ItemSNo cell is numbered, so the row is not lost", () => {
    const table = analyzePaste("ItemSNo\tHSN\n\t7009\nA\t8714");
    expect(table.rows).toEqual([
      ["1", "7009"],
      ["A", "8714"],
    ]);
  });

  test("CRLF, quoted cells, embedded newlines and blank lines", () => {
    const text = 'HSN\tDescription\r\n7009\t"Mirror, plastic"\r\n\r\n8714\t"Frame\nwith bracket"\r\n';
    const table = analyzePaste(text);
    expect(table.error).toBeNull();
    expect(table.rows).toEqual([
      ["1", "7009", "Mirror, plastic"],
      ["2", "8714", "Frame\nwith bracket"],
    ]);
  });

  test("a title row above the header is skipped", () => {
    const table = analyzePaste("Mirror export\nHSN\tDescription\n7009\tmirror");
    expect(table.error).toBeNull();
    expect(table.rows).toEqual([["1", "7009", "mirror"]]);
  });

  test("unclaimed and repeated headers are reported as not used", () => {
    const table = analyzePaste("HSN\tDescription\tRemarks\tHSN\n7009\tmirror\tok\t8714");
    expect(table.error).toBeNull();
    expect(table.columns.map((c) => c.key)).toEqual(["itemSno", "ritc", "description"]);
    expect(table.ignored).toEqual(["Remarks", "HSN"]);
    expect(table.rows).toEqual([["1", "7009", "mirror"]]);
  });

  test("rejects empty text, tables without headers, tables without HSN and header-only tables", () => {
    expect(analyzePaste("  \n \t ").error).toContain("Nothing to paste");
    expect(analyzePaste("1\tmirror\t7009").error).toContain("No column names");
    expect(analyzePaste("ItemSNo\tDescription\n1\tmirror").error).toContain("No HSN column");
    expect(analyzePaste("HSN\tDescription").error).toContain("no data rows");
  });
});

describe("pasted numbers", () => {
  test("group separators are dropped, other text is left alone", () => {
    expect(pastedNumber("2,500.50")).toBe(2500.5);
    expect(pastedNumber("1,000")).toBe(1000);
    expect(pastedNumber("1,00,000")).toBe(100000);
    expect(pastedNumber("-12,345")).toBe(-12345);
    expect(pastedNumber("300")).toBe(300);
    expect(pastedNumber("1,5")).toBe("1,5");
    expect(pastedNumber("12,34")).toBe("12,34");
    expect(pastedNumber("NOS")).toBe("NOS");
  });
});
