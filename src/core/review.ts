import { COL, cell, numberIfNumeric, type SheetPort } from "./sheet";

/** Cell text keyed by address, as the review table shows it. Formulas read "=M2", empty cells "". */
export type Snapshot = Readonly<Record<string, string>>;

/** Manual edits keyed by cell address. The text is what the user typed: a number, "=formula", or "" to clear. */
export type Overrides = Readonly<Record<string, string>>;

export interface ReviewColumn {
  col: string;
  label: string;
  /** Free text (descriptions, scheme names) rather than a code or number. */
  text?: boolean;
  /** Wider column. */
}

/** Columns kept as text when typed, because codes such as HSN lose meaning as numbers. */
const TEXT_COLUMNS: ReadonlySet<string> = new Set([COL.ritc]);

/**
 * Columns shown after a fill: the identity columns first, then the ones the fill writes.
 * IGST columns only matter when IGST is paid; the optional FTA column exists only in some templates.
 */
export function reviewColumns(paid: boolean, ftaCol?: string): ReviewColumn[] {
  return [
    { col: COL.ritc, label: "HSN" },
    { col: COL.description, label: "Description", text: true },
    { col: COL.quantity, label: "Qty" },
    { col: COL.qtyUnit, label: "UQC" },
    { col: COL.sqcQty, label: "SQC qty" },
    { col: COL.sqcUnit, label: "SQC UQC" },
    { col: COL.dbkSr, label: "DBK sr" },
    { col: COL.dbkQty, label: "DBK qty" },
    { col: COL.dbkRate, label: "DBK rate" },
    { col: COL.dbkUnit, label: "DBK UQC" },
    { col: COL.rodtep, label: "RoDTEP" },
    ...(paid
      ? [
          { col: COL.igstTaxable, label: "IGST taxable" },
          { col: COL.igstRate, label: "IGST rate" },
          { col: COL.igstAmount, label: "IGST amount" },
        ]
      : []),
    { col: COL.scheme, label: "Scheme", text: true },
    { col: COL.endUse, label: "End use" },
    { col: COL.reward, label: "Reward" },
    { col: COL.paymentStatus, label: "Payment" },
    ...(ftaCol ? [{ col: ftaCol, label: "FTA" }] : []),
    { col: COL.country, label: "Country" },
    { col: COL.state, label: "State" },
    { col: COL.district, label: "District" },
  ];
}

/** Every address the review table shows, so the I/O layer can read them in one pass. */
export function reviewAddresses(rows: readonly number[], columns: readonly ReviewColumn[]): string[] {
  return rows.flatMap((r) => columns.map((c) => cell(c.col, r)));
}

/** What a typed override means for the sheet. */
export type Edit =
  | { kind: "clear" }
  | { kind: "formula"; formula: string }
  | { kind: "value"; value: string | number };

/** The column letters of a cell address: "K12" gives "K". */
const columnOf = (address: string): string => address.replace(/\d+$/, "");

export function parseEdit(address: string, raw: string): Edit {
  const typed = raw.trim();
  if (typed === "") return { kind: "clear" };
  if (typed.startsWith("=") && typed.length > 1) return { kind: "formula", formula: typed.slice(1).trim() };
  // Leading zeros ("0101") and code columns stay text.
  if (TEXT_COLUMNS.has(columnOf(address)) || /^-?0\d/.test(typed)) return { kind: "value", value: typed };
  return { kind: "value", value: numberIfNumeric(typed) };
}

/**
 * The sheet as it reads with typed HSN codes in place, so a code typed in the review table is looked up
 * and filled like one from the file. Other columns and writes pass through unchanged.
 */
export function withHsnEdits(sheet: SheetPort, overrides: Overrides): SheetPort {
  return {
    ...sheet,
    get: (address) => {
      const raw = overrides[address];
      const isHsn = columnOf(address) === COL.ritc;
      // A formula in the HSN column has no value to read here, so the file's cell stands.
      if (!isHsn || raw === undefined || raw.trim().startsWith("=")) return sheet.get(address);
      return raw.trim();
    },
  };
}

/** Writes manual edits over a filled sheet. */
export function applyOverrides(sheet: SheetPort, overrides: Overrides): void {
  for (const [address, raw] of Object.entries(overrides)) {
    const edit = parseEdit(address, raw);
    if (edit.kind === "clear") sheet.clear(address);
    else if (edit.kind === "formula") sheet.setFormula(address, edit.formula);
    else sheet.setValue(address, edit.value);
  }
}
