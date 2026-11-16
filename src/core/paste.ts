import { COL, numberIfNumeric } from "./sheet";

/**
 * A table copied from Excel or Google Sheets arrives as tab-separated text. Columns are matched by
 * their header row, because a pasted selection has no cell addresses to map from.
 */

/** The generated sheet places FTACode here; the real template may have it anywhere, and fill finds it by header. */
export const PASTE_FTA_COL = "AL";

const DEFS = {
  itemSno: {
    col: COL.itemSno,
    label: "ItemSNo",
    aliases: [
      "ItemSNo",
      "Item S No",
      "Item S.No",
      "Item No",
      "Item Number",
      "S No",
      "SNo",
      "Sr No",
      "Serial No",
    ],
  },
  description: {
    col: COL.description,
    label: "Description",
    aliases: [
      "Description",
      "Description of Goods",
      "Goods Description",
      "Product Description",
      "Item Description",
      "Item Name",
      "Item",
      "Product Name",
      "Product",
      "Goods",
      "Particulars",
    ],
  },
  endUse: {
    col: COL.endUse,
    label: "End use",
    aliases: ["End Use", "EndUse", "End Use Code", "EndUseCode"],
  },
  reward: {
    col: COL.reward,
    label: "Reward",
    aliases: ["Reward Item", "RewardItem", "Reward"],
  },
  paymentStatus: {
    col: COL.paymentStatus,
    label: "Payment status",
    aliases: ["IGST Payment Status", "Payment Status", "IGST Status", "PaymentStatus"],
  },
  ritc: {
    col: COL.ritc,
    label: "HSN",
    aliases: [
      "RITCCode",
      "RITC Code",
      "RITC",
      "HSN",
      "HSN Code",
      "HS Code",
      "HS",
      "Tariff Code",
      "Tariff",
      "CTH",
    ],
  },
  scheme: {
    col: COL.scheme,
    label: "Scheme",
    aliases: ["ApplicableExpSchemes", "Applicable Exp Schemes", "Scheme", "Scheme Code", "Export Scheme"],
  },
  quantity: {
    col: COL.quantity,
    label: "Qty",
    aliases: ["Quantity", "Qty"],
  },
  qtyUnit: {
    col: COL.qtyUnit,
    label: "Unit",
    aliases: ["Quantity Unit", "Qty Unit", "Unit", "UQC", "Unit of Quantity", "Unit of Measure", "UOM"],
  },
  sqcQty: {
    col: COL.sqcQty,
    label: "SQC qty",
    aliases: ["SQCQTY", "SQC Qty", "SQC Quantity"],
  },
  sqcUnit: {
    col: COL.sqcUnit,
    label: "SQC unit",
    aliases: ["SQCUnit", "SQC Unit", "SQC UQC"],
  },
  fob: {
    col: COL.fob,
    label: "FOB",
    aliases: ["FOB", "FOB Value", "FOBValue", "Item FOB", "Item FOB Value", "FOB Value INR", "FOBValueINR"],
  },
  country: {
    col: COL.country,
    label: "Country",
    aliases: [
      "CountryDestination",
      "Country Destination",
      "Destination Country",
      "Country of Destination",
      "Country",
    ],
  },
  state: {
    col: COL.state,
    label: "State",
    aliases: ["StateOrigin", "State Origin", "Origin State", "State of Origin", "State"],
  },
  district: {
    col: COL.district,
    label: "District",
    aliases: ["DistrictOrigin", "District Origin", "Origin District", "District"],
  },
  igstTaxable: {
    col: COL.igstTaxable,
    label: "IGST taxable",
    aliases: ["IGST Taxable", "IGST Taxable Value", "Taxable Value", "Assessable Value"],
  },
  igstRate: {
    col: COL.igstRate,
    label: "IGST rate",
    aliases: ["IGST Rate", "IGST %", "IGST Percent", "IGST Percentage"],
  },
  igstAmount: {
    col: COL.igstAmount,
    label: "IGST amount",
    aliases: ["IGST Amount", "IGST Amt", "IGST"],
  },
  rodtep: {
    col: COL.rodtep,
    label: "RoDTEP",
    aliases: ["RoDTEP", "RODTEP", "RoDTEP Claim", "RoDTEP Status"],
  },
  dbkSr: {
    col: COL.dbkSr,
    label: "DBK SR",
    aliases: ["drawback_schno", "Drawback SR No", "DBK SR No", "DBK SR"],
  },
  dbkQty: {
    col: COL.dbkQty,
    label: "DBK qty",
    aliases: ["dbk_qty", "DBK Qty", "Drawback Qty"],
  },
  dbkRate: {
    col: COL.dbkRate,
    label: "DBK rate",
    aliases: ["dbk_rate", "DBK Rate", "Drawback Rate"],
  },
  dbkUnit: {
    col: COL.dbkUnit,
    label: "DBK unit",
    aliases: ["dbk_unit", "DBK Unit", "Drawback Unit"],
  },
  fta: {
    col: PASTE_FTA_COL,
    label: "FTA",
    aliases: ["FTACode", "FTA Code", "FTA"],
  },
} as const;

export type PasteKey = keyof typeof DEFS;

interface PasteColumn {
  key: PasteKey;
  /** Column letter in the generated worksheet. */
  col: string;
  /** Short name shown in the preview. */
  label: string;
  /** Header text as copied, or "" for a generated ItemSNo column. */
  header: string;
}

export interface PastedTable {
  /** Mapped columns in pasted order; ItemSNo is prepended when the table does not have one. */
  columns: PasteColumn[];
  /** Data rows, aligned with `columns`. */
  rows: string[][];
  /** Header cells that no field claimed. */
  ignored: string[];
  /** Why the text cannot be used, or null when it can. */
  error: string | null;
}

interface Found {
  key: PasteKey;
  index: number;
  header: string;
}

interface InternalColumn extends PasteColumn {
  source: number;
}

const GROUPED_NUMBER = /^-?(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})+,\d{3})(\.\d+)?$/;

/** Excel copies formatted numbers with group separators (2,500.50 or 1,00,000); a plain number comes back as is. */
export function pastedNumber(raw: string): string | number {
  const trimmed = raw.trim();
  return numberIfNumeric(GROUPED_NUMBER.test(trimmed) ? trimmed.replace(/,/g, "") : trimmed);
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const BY_ALIAS = new Map<string, PasteKey>();
for (const key of Object.keys(DEFS) as PasteKey[]) {
  for (const alias of DEFS[key].aliases) BY_ALIAS.set(normalize(alias), key);
}

/** Splits tab-separated clipboard text. Quoted cells may contain tabs, newlines and doubled quotes. */
function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(trimEnd(row));
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(trimEnd(row));
  }
  return rows;
}

/** Excel appends trailing tabs to some copies; they are noise, not columns. */
function trimEnd(row: string[]): string[] {
  let end = row.length;
  while (end > 0 && row[end - 1]?.trim() === "") end--;
  return row.slice(0, end);
}

/** The first row that reads as column names. One hit is enough in the first row; later rows need two. */
function findHeader(grid: string[][]): { rowIndex: number; found: Found[] } | null {
  let best: { rowIndex: number; found: Found[] } | null = null;
  for (let r = 0; r < Math.min(grid.length, 5); r++) {
    const cells = grid[r];
    if (!cells) continue;
    const found: Found[] = [];
    const seen = new Set<PasteKey>();
    cells.forEach((cell, index) => {
      const key = BY_ALIAS.get(normalize(cell));
      if (!key || seen.has(key)) return;
      seen.add(key);
      found.push({ key, index, header: cell.trim() });
    });
    if (found.length < (r === 0 ? 1 : 2)) continue;
    if (!best || found.length > best.found.length) best = { rowIndex: r, found };
  }
  return best;
}

function fail(error: string): PastedTable {
  return { columns: [], rows: [], ignored: [], error };
}

/** Reads copied table text into template columns. */
export function analyzePaste(text: string): PastedTable {
  const grid = parseTable(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (grid.length === 0) return fail("Nothing to paste yet.");

  const header = findHeader(grid);
  if (!header) {
    return fail("No column names found. Copy the table with its header row (HSN, Description, Quantity…).");
  }
  if (!header.found.some((f) => f.key === "ritc")) {
    return fail('No HSN column found. Name the column "HSN" or "RITCCode" and paste again.');
  }

  const data = grid.slice(header.rowIndex + 1);
  if (data.length === 0) return fail("The header row is there, but no data rows follow it.");

  const columns: InternalColumn[] = header.found.map((f) => ({
    key: f.key,
    col: DEFS[f.key].col,
    label: DEFS[f.key].label,
    header: f.header,
    source: f.index,
  }));
  if (!columns.some((c) => c.key === "itemSno")) {
    columns.unshift({
      key: "itemSno",
      col: COL.itemSno,
      label: DEFS.itemSno.label,
      header: "",
      source: -1,
    });
  }
  const sno = columns.findIndex((c) => c.key === "itemSno");

  const rows: string[][] = [];
  for (const cells of data) {
    const values = columns.map((c) => (c.source < 0 ? "" : (cells[c.source] ?? "").trim()));
    if (values.every((v) => v === "")) continue;
    // A blank ItemSNo would make the row invisible to the scanner, so number it like a blank one.
    if (values[sno] === "") values[sno] = String(rows.length + 1);
    rows.push(values);
  }
  if (rows.length === 0) return fail("No data rows after the header row.");

  const used = new Set(header.found.map((f) => f.index));
  const ignored = (grid[header.rowIndex] ?? [])
    .map((cell, i) => (used.has(i) ? "" : cell.trim()))
    .filter(Boolean);

  return {
    columns: columns.map(({ key, col, label, header }) => ({ key, col, label, header })),
    rows,
    ignored,
    error: null,
  };
}
