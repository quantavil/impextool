/** Minimal cell access the core logic needs. The XLSX adapter lives in io/; tests use an in-memory map. */
export interface SheetPort {
  get(address: string): string | number | undefined;
  setValue(address: string, value: string | number): void;
  setFormula(address: string, formula: string): void;
  clear(address: string): void;
}

/** Column letters of the ProductFormat.xlsx template. */
export const COL = {
  itemSno: "B",
  description: "D",
  endUse: "E",
  reward: "I",
  paymentStatus: "J",
  ritc: "K",
  scheme: "L",
  quantity: "M",
  qtyUnit: "N",
  sqcQty: "O",
  sqcUnit: "P",
  fob: "R",
  dbkSr: "U",
  dbkQty: "V",
  dbkRate: "W",
  dbkUnit: "X",
  country: "AB",
  state: "AD",
  district: "AE",
  igstTaxable: "AF",
  igstRate: "AG",
  igstAmount: "AH",
  rodtep: "AJ",
  rodtepQty: "AK",
} as const;

/** Header text the template is expected to carry; mismatches are warnings, not errors. */
export const EXPECTED_HEADERS: Readonly<Record<string, string>> = {
  B: "ItemSNo",
  D: "Description",
  I: "RewardItem",
  K: "RITCCode",
  L: "ApplicableExpSchemes",
  M: "Quantity",
  N: "QuantityUnit",
  O: "SQCQTY",
  P: "SQCUnit",
  U: "drawback_schno",
  V: "dbk_qty",
  W: "dbk_rate",
  X: "dbk_unit",
  AB: "CountryDestination",
  AD: "StateOrigin",
  AE: "DistrictOrigin",
  AJ: "RODTEP",
};

export const cell = (col: string, row: number): string => `${col}${row}`;

export function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

/** Numeric-looking strings become numbers so Excel stores them as numbers (e.g. DBK rate "2" -> 2). */
export function numberIfNumeric(value: string | number): string | number {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : value;
}

/** Column letter whose header is `header` (case-insensitive) in the first row, or undefined when the template lacks it. */
export function findColumn(sheet: SheetPort, header: string, headerRow = 1): string | undefined {
  const letters = (n: number): string =>
    (n < 26 ? "" : letters(Math.floor(n / 26) - 1)) + String.fromCharCode(65 + (n % 26));
  for (let i = 0; i < 104; i++) {
    const col = letters(i);
    if (text(sheet.get(cell(col, headerRow))).toLowerCase() === header.toLowerCase()) return col;
  }
  return undefined;
}
