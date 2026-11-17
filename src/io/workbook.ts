import XLSX from "xlsx-js-style";
import { evaluateFormula } from "../core/formula";
import { analyzePaste, PASTE_FTA_COL, type PastedTable, type PasteKey, pastedNumber } from "../core/paste";
import { applyOverrides, type Overrides, type Snapshot } from "../core/review";
import { type Guidelines, headerMismatches, indexRows, type RowIndex, readGuidelines } from "../core/scan";
import { COL, cell, EXPECTED_HEADERS, type SheetPort } from "../core/sheet";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface Loaded {
  fileName: string;
  sheetName: string;
  /** The original bytes. Every fill starts from a fresh parse of these, so re-applying never stacks on an earlier fill. */
  buffer: ArrayBuffer;
  /** Read-only view of the original sheet, used for planning and prefill. */
  sheet: SheetPort;
  index: RowIndex;
  guidelines: Guidelines;
  warnings: string[];
}

/** Adapts a SheetJS worksheet to the core's SheetPort. Keeps cell formatting when values change. */
function toPort(ws: XLSX.WorkSheet): SheetPort {
  const styleOf = (a: string) => {
    const s = ws[a]?.s;
    return s ? { s } : {};
  };
  const grow = (a: string) => {
    const c = XLSX.utils.decode_cell(a);
    const ref = ws["!ref"];
    const range = ref ? XLSX.utils.decode_range(ref) : { s: c, e: c };
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: Math.min(range.s.r, c.r), c: Math.min(range.s.c, c.c) },
      e: { r: Math.max(range.e.r, c.r), c: Math.max(range.e.c, c.c) },
    });
  };
  return {
    get: (a) => {
      const v = ws[a]?.v;
      return typeof v === "string" || typeof v === "number" ? v : undefined;
    },
    setValue: (a, value) => {
      ws[a] = { ...styleOf(a), t: typeof value === "number" ? "n" : "s", v: value };
      grow(a);
    },
    setFormula: (a, f) => {
      ws[a] = { ...styleOf(a), t: "n", f };
      grow(a);
    },
    clear: (a) => {
      const s = ws[a]?.s;
      if (s) ws[a] = { t: "z", s };
      else delete ws[a];
    },
  };
}

function parse(buffer: ArrayBuffer): { workbook: XLSX.WorkBook; sheetName: string; ws: XLSX.WorkSheet } {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: true, cellFormula: true });
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === "sheet1") ?? workbook.SheetNames[0] ?? "";
  const ws = workbook.Sheets[sheetName];
  if (!ws?.["!ref"]) throw new Error("The sheet appears to be empty.");
  return { workbook, sheetName, ws };
}

function readWorkbook(buffer: ArrayBuffer, fileName: string, pasted = false): Loaded {
  const { workbook, sheetName, ws } = parse(buffer);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const sheet = toPort(ws);
  const headerRow = range.s.r + 1;
  const index = indexRows(sheet, headerRow, range.e.r + 1);
  if (index.dataRows.length === 0) {
    throw new Error("No data rows: column B (ItemSNo) is empty everywhere.");
  }

  const warnings: string[] = [];
  const numericHsn = index.dataRows.filter((r) => typeof sheet.get(cell(COL.ritc, r)) === "number").length;
  if (numericHsn > 0) {
    warnings.push(
      `${numericHsn} HSN cell(s) are stored as numbers, so leading zeros may be lost. Format column K as Text.`,
    );
  }
  const mismatches = headerMismatches(sheet, headerRow);
  if (mismatches.length) {
    warnings.push(
      `${mismatches.length} header(s) differ from the ProductFormat template; filling by column letter.`,
    );
    warnings.push(...mismatches.slice(0, 6));
  }

  const gws = workbook.Sheets.Guidelines;
  const gRef = gws?.["!ref"];
  // A pasted table is built here, so its missing Guidelines sheet is expected, not a warning.
  if (!pasted && (!gws || !gRef)) {
    warnings.push("No Guidelines sheet: scheme, end use and payment lists use defaults.");
  }
  const guidelines =
    gws && gRef
      ? readGuidelines(toPort(gws), XLSX.utils.decode_range(gRef).e.r + 1)
      : readGuidelines(null, 0);

  return { fileName, sheetName, buffer, sheet, index, guidelines, warnings };
}

export async function openWorkbook(file: File): Promise<Loaded> {
  return readWorkbook(await file.arrayBuffer(), file.name);
}

const PASTE_FILE = "Pasted table.xlsx";
const PASTE_NUMERIC: ReadonlySet<PasteKey> = new Set([
  "quantity",
  "sqcQty",
  "fob",
  "igstTaxable",
  "igstRate",
  "igstAmount",
  "dbkQty",
  "dbkRate",
]);
/** Headers for columns the template names are not known for; only written when the pasted table has them. */
const PASTE_EXTRA_HEADERS: Partial<Record<PasteKey, string>> = {
  endUse: "EndUseCode",
  paymentStatus: "IGSTPaymentStatus",
  fob: "FOB",
  igstTaxable: "IGSTTaxableValue",
  igstRate: "IGSTRate",
  igstAmount: "IGSTAmount",
  fta: "FTACode",
};

/** Builds a workbook from mapped paste columns: template headers in row 1, one row per pasted record. */
function pasteBuffer(table: PastedTable): ArrayBuffer {
  const width = XLSX.utils.decode_col(PASTE_FTA_COL) + 1;
  const blank = () => Array.from({ length: width }, (): string | number | null => null);
  const header = blank();
  for (const [col, title] of Object.entries(EXPECTED_HEADERS)) header[XLSX.utils.decode_col(col)] = title;
  header[XLSX.utils.decode_col(PASTE_FTA_COL)] = "FTACode";
  for (const c of table.columns) {
    const col = XLSX.utils.decode_col(c.col);
    const extra = PASTE_EXTRA_HEADERS[c.key];
    if (extra !== undefined && header[col] === null) header[col] = extra;
  }

  const aoa: (string | number | null)[][] = [header];
  for (const values of table.rows) {
    const row = blank();
    table.columns.forEach((c, i) => {
      const raw = values[i] ?? "";
      if (raw === "") return;
      row[XLSX.utils.decode_col(c.col)] = PASTE_NUMERIC.has(c.key) ? pastedNumber(raw) : raw;
    });
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, "Sheet1");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

/** Opens a table copied from Excel, with the same validation and warnings as an uploaded file. */
export function openPastedTable(text: string): Loaded {
  const table = analyzePaste(text);
  if (table.error) throw new Error(table.error);
  return readWorkbook(pasteBuffer(table), PASTE_FILE, true);
}

/** Cell text as the review table shows it: formulas as "=M2", empty cells as "". */
function snapshot(ws: XLSX.WorkSheet, addresses: readonly string[]): Snapshot {
  const out: Record<string, string> = {};
  for (const a of addresses) {
    const c = ws[a];
    out[a] = c?.f ? `=${c.f}` : c?.v === undefined || c.v === null ? "" : String(c.v).trim();
  }
  return out;
}

/**
 * Stores a result next to every formula, as Excel does on save. ImpexCube reads the stored result, and a
 * formula written without one reaches it as empty text, which it cannot convert to a number.
 */
function cacheFormulaResults(ws: XLSX.WorkSheet): void {
  const busy = new Set<string>();
  const valueAt = (address: string): string | number | undefined => {
    const c = ws[address];
    if (!c?.f) return typeof c?.v === "string" || typeof c?.v === "number" ? c.v : undefined;
    if (busy.has(address)) throw new Error(`Formula in ${address} refers back to itself.`);
    busy.add(address);
    let value = evaluateFormula(c.f, valueAt);
    // A formula this evaluator does not know keeps the result Excel stored with it, if there is one.
    if (value === undefined && (typeof c.v === "string" || typeof c.v === "number")) value = c.v;
    busy.delete(address);
    if (value === undefined)
      throw new Error(`Cannot work out ${address} (=${c.f}). Type its value in the review table.`);
    ws[address] = { ...c, t: typeof value === "number" ? "n" : "s", v: value };
    return value;
  };
  for (const address of Object.keys(ws)) {
    if (/^[A-Z]+\d+$/.test(address)) valueAt(address);
  }
}

export interface BuildExtras {
  /** Manual edits written over the filled sheet. */
  overrides?: Overrides;
  /** Addresses to read before and after the fill, for the review table. */
  watch?: readonly string[];
}

/**
 * Runs `fill` on a fresh copy of the original sheet, then writes any manual overrides on top.
 * Returns the written file, whatever `fill` returned, and the watched cells before and after the fill (overrides excluded).
 */
export function fillAndBuild<T>(
  loaded: Loaded,
  fill: (sheet: SheetPort, rows: readonly number[]) => T,
  { overrides = {}, watch = [] }: BuildExtras = {},
): { blob: Blob; result: T; before: Snapshot; after: Snapshot } {
  const { workbook, ws } = parse(loaded.buffer);
  const before = snapshot(ws, watch);
  const port = toPort(ws);
  const result = fill(port, loaded.index.dataRows);
  const after = snapshot(ws, watch);
  applyOverrides(port, overrides);
  cacheFormulaResults(ws);
  const ref = ws["!ref"];
  if (ref) {
    // Matches the userscript: font size 11 on every used cell.
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellObj = ws[XLSX.utils.encode_cell({ r, c })];
        if (cellObj) cellObj.s = { ...cellObj.s, font: { ...cellObj.s?.font, sz: 11 } };
      }
    }
  }
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
  return { blob: new Blob([bytes], { type: XLSX_MIME }), result, before, after };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** `<name>_Filled_<local date>_<local time>.xlsx`. Date and time both use local time. */
export function outputName(fileName: string, now = new Date()): string {
  const base = fileName.replace(/\.(xlsx|xls)$/i, "");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}_Filled_${date}_${time}.xlsx`;
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
