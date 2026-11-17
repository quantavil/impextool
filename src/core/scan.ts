import { END_USE_CODES, mergeCodes, SCHEME_CODES } from "../data/codes";
import { COL, cell, EXPECTED_HEADERS, type SheetPort, text } from "./sheet";

/** Columns of the "Guidelines" sheet that hold the picklists. */
const GUIDE = { scheme: "F", endUse: "L", payment: "N" } as const;

export interface RowIndex {
  dataRows: number[];
  rowsByRitc: Record<string, number[]>;
  blankRitcRows: number;
}

export function indexRows(sheet: SheetPort, headerRow: number, lastRow: number): RowIndex {
  const dataRows: number[] = [];
  for (let r = headerRow + 1; r <= lastRow; r++) {
    if (text(sheet.get(cell(COL.itemSno, r))) !== "") dataRows.push(r);
  }
  return { dataRows, ...groupByHsn(dataRows, (r) => text(sheet.get(cell(COL.ritc, r)))) };
}

/** Rows grouped by the HSN code `hsnAt` returns for each one. Rows with no code are counted, not grouped. */
function groupByHsn(
  rows: readonly number[],
  hsnAt: (row: number) => string,
): Pick<RowIndex, "rowsByRitc" | "blankRitcRows"> {
  const rowsByRitc: Record<string, number[]> = {};
  let blankRitcRows = 0;
  for (const r of rows) {
    const ritc = hsnAt(r);
    if (!ritc) {
      blankRitcRows++;
      continue;
    }
    const list = rowsByRitc[ritc] ?? [];
    list.push(r);
    rowsByRitc[ritc] = list;
  }
  return { rowsByRitc, blankRitcRows };
}

/** The same rows, grouped again from the sheet as it reads now, so an HSN typed after the parse counts. */
export function regroupHsn(base: RowIndex, sheet: SheetPort): RowIndex {
  return { dataRows: base.dataRows, ...groupByHsn(base.dataRows, (r) => text(sheet.get(cell(COL.ritc, r)))) };
}

export function headerMismatches(sheet: SheetPort, headerRow: number): string[] {
  return Object.entries(EXPECTED_HEADERS).flatMap(([col, expected]) => {
    const found = text(sheet.get(cell(col, headerRow)));
    return found === expected
      ? []
      : [`${cell(col, headerRow)}: expected "${expected}", found "${found || "(blank)"}"`];
  });
}

export interface Guidelines {
  schemeCodes: string[];
  endUseCodes: string[];
  paymentStatusCodes: string[];
}

export function readGuidelines(sheet: SheetPort | null, lastRow: number): Guidelines {
  const column = (col: string): string[] => {
    if (!sheet) return [];
    const seen = new Set<string>();
    for (let r = 1; r <= lastRow; r++) {
      const v = text(sheet.get(cell(col, r)));
      if (v) seen.add(v);
    }
    return [...seen];
  };
  const endUseCodes = mergeCodes(column(GUIDE.endUse), END_USE_CODES);
  endUseCodes.splice(0, endUseCodes.length, "GNX100", ...endUseCodes.filter((c) => c !== "GNX100"));
  const paymentStatusCodes = column(GUIDE.payment);
  if (paymentStatusCodes.length === 0) paymentStatusCodes.push("NA", "LUT", "P");
  if (!paymentStatusCodes.includes("LUT")) paymentStatusCodes.unshift("LUT");
  return { schemeCodes: mergeCodes(column(GUIDE.scheme), SCHEME_CODES), endUseCodes, paymentStatusCodes };
}

/** The value every data row agrees on, or "" if rows are blank or disagree. */
export function consistentValue(sheet: SheetPort, rows: readonly number[], col: string): string {
  const values = rows.map((r) => text(sheet.get(cell(col, r))));
  const first = values[0];
  return first && values.every((v) => v === first) ? first : "";
}
