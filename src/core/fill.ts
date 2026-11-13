import { type DbkPlan, type DutyRecord, resolveDbkEntry } from "./duty";
import { type CurrencyRate, igstFactor } from "./rates";
import { COL, cell, findColumn, numberIfNumeric, type SheetPort, text } from "./sheet";

const DRAWBACK_PREFIXES = new Set([
  19, 41, 42, 43, 44, 46, 47, 48, 49, 60, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 79,
]);

/** Columns owned by a matched row: rewritten from duty data, cleared first. */
const DUTY_COLS = [COL.sqcUnit, COL.rodtep, COL.dbkSr, COL.dbkQty, COL.dbkRate, COL.dbkUnit] as const;
const IGST_COLS = [COL.igstTaxable, COL.igstRate, COL.igstAmount] as const;

export function isDrawbackScheme(code: string): boolean {
  const digits = code.trim().match(/^\d+/)?.[0];
  return digits !== undefined && DRAWBACK_PREFIXES.has(Number.parseInt(digits, 10));
}

/** Shipment choices as the user sets them. */
export interface ShipmentForm {
  scheme: string;
  endUse: string;
  /** Optional FTA code, written to the template's FTACode column when it has one. */
  fta?: string;
  reward: string;
  /** Whether to claim RoDTEP ("Yes" or "No"). "Yes" becomes N/A on rows whose HS code has no RoDTEP entry. */
  rodtep: string;
  state: string;
  district: string;
  country: string;
  paymentStatus: string;
  currency: CurrencyRate | null;
  igstPercent: Readonly<Record<string, number | undefined>>;
}

export interface FillOptions extends ShipmentForm {
  plan: DbkPlan;
  duty: Readonly<Record<string, DutyRecord>>;
}

/** Field ids shared by blockers and the form, so a blocker can point at the input that fixes it. */
export const FIELD = {
  scheme: "scheme",
  endUse: "endUse",
  reward: "reward",
  payment: "payment",
  currency: "currency",
  dbk: (ritc: string, group: string) => `dbk:${ritc}:${group}`,
  igst: (ritc: string) => `igst:${ritc}`,
} as const;

export interface Blocker {
  id: string;
  message: string;
}

export function fillBlockers(o: FillOptions, ritcs: readonly string[]): Blocker[] {
  const blockers: Blocker[] = [];
  const need = (ok: boolean, id: string, message: string) => {
    if (!ok) blockers.push({ id, message });
  };
  need(o.scheme !== "", FIELD.scheme, "Choose a Scheme Code.");
  need(o.endUse !== "", FIELD.endUse, "Choose an End Use code.");
  need(o.reward !== "", FIELD.reward, "Choose Reward Item (Yes / No).");
  need(o.paymentStatus !== "", FIELD.payment, "Choose IGST Payment Status.");
  if (isDrawbackScheme(o.scheme)) {
    for (const [ritc, item] of Object.entries(o.plan)) {
      if (item.mode !== "multi") continue;
      for (const g of item.groups) {
        need(g.entry !== null, FIELD.dbk(ritc, g.key), `Choose a DBK option for HSN ${ritc} (${g.label}).`);
      }
    }
  }
  if (o.paymentStatus === "P") {
    need(o.currency !== null, FIELD.currency, "Choose a currency for IGST.");
    for (const ritc of ritcs) {
      need(o.igstPercent[ritc] !== undefined, FIELD.igst(ritc), `Choose an IGST rate for HSN ${ritc}.`);
    }
  }
  return blockers;
}

export interface FillReport {
  rows: number;
  matched: number;
  unmatched: number;
  drawbackRows: number;
  igstRows: number;
  summary: string[];
}

/**
 * Writes the filled values into the sheet. Shipment fields go to every row.
 * Duty fields are only rewritten on rows that have duty data, so unmatched rows keep their source values.
 * IGST columns are always decided by payment status and per-HSN rate.
 */
export function fillWorkbook(sheet: SheetPort, rows: readonly number[], o: FillOptions): FillReport {
  const drawback = isDrawbackScheme(o.scheme);
  const zeroIgst = o.paymentStatus === "LUT" || o.paymentStatus === "NA";
  const paid = o.paymentStatus === "P";
  const ftaCol = o.fta ? findColumn(sheet, "FTACode") : undefined;
  const report: FillReport = {
    rows: rows.length,
    matched: 0,
    unmatched: 0,
    drawbackRows: 0,
    igstRows: 0,
    summary: [],
  };

  for (const r of rows) {
    const ritc = text(sheet.get(cell(COL.ritc, r)));
    write(sheet, COL.scheme, r, o.scheme);
    write(sheet, COL.endUse, r, o.endUse);
    if (ftaCol && o.fta) write(sheet, ftaCol, r, o.fta);
    write(sheet, COL.reward, r, o.reward);
    write(sheet, COL.state, r, o.state);
    // A newly chosen state with no district must not leave the file's old district behind.
    if (o.state !== "" && o.district === "") sheet.clear(cell(COL.district, r));
    else write(sheet, COL.district, r, o.district);
    write(sheet, COL.country, r, o.country);
    write(sheet, COL.paymentStatus, r, o.paymentStatus);

    const rec = ritc ? o.duty[ritc] : undefined;
    if (rec) {
      report.matched++;
      if (writeDuty(sheet, r, rec, ritc, o, drawback)) report.drawbackRows++;
    } else if (ritc) {
      report.unmatched++;
    }
    if (writeIgst(sheet, r, ritc, o, zeroIgst, paid)) report.igstRows++;
  }

  report.summary = summarize(report, o, drawback, zeroIgst, paid);
  return report;
}

const write = (sheet: SheetPort, col: string, row: number, value: string | number): void => {
  if (value !== "") sheet.setValue(cell(col, row), value);
};

/** Writes duty-driven columns for one matched row. Returns true when Drawback columns were filled. */
function writeDuty(
  sheet: SheetPort,
  r: number,
  rec: DutyRecord,
  ritc: string,
  o: FillOptions,
  drawback: boolean,
): boolean {
  for (const col of DUTY_COLS) sheet.clear(cell(col, r));

  const sqcUnit = rec.uqc;
  write(sheet, COL.sqcUnit, r, sqcUnit);
  const qtyUnit = text(sheet.get(cell(COL.qtyUnit, r)));
  if (sqcUnit === "NOS" || (sqcUnit !== "" && sqcUnit === qtyUnit)) {
    sheet.setFormula(cell(COL.sqcQty, r), cell(COL.quantity, r));
  }

  // RODTEP says whether the row claims RoDTEP: the user's choice, or N/A when ImpexCube has no RoDTEP entry for the HS code.
  write(sheet, COL.rodtep, r, o.rodtep === "Yes" && !rec.rodtepFound ? "N/A" : o.rodtep);

  const entry = drawback ? resolveDbkEntry(o.plan, ritc, r) : null;
  if (!entry) return false;
  const unit = entry.unit || qtyUnit;
  write(sheet, COL.dbkSr, r, entry.srNo);
  write(sheet, COL.dbkRate, r, numberIfNumeric(entry.rate));
  write(sheet, COL.dbkUnit, r, unit);
  sheet.setFormula(cell(COL.dbkQty, r), cell(unit !== "" && unit === sqcUnit ? COL.sqcQty : COL.quantity, r));
  return true;
}

function writeIgst(
  sheet: SheetPort,
  r: number,
  ritc: string,
  o: FillOptions,
  zeroIgst: boolean,
  paid: boolean,
): boolean {
  if (zeroIgst) {
    for (const col of IGST_COLS) write(sheet, col, r, 0);
    return false;
  }
  const pct = ritc ? o.igstPercent[ritc] : undefined;
  if (paid && o.currency && pct !== undefined) {
    sheet.setFormula(cell(COL.igstTaxable, r), `${cell(COL.fob, r)}*${o.currency.exp}`);
    write(sheet, COL.igstRate, r, pct);
    sheet.setFormula(cell(COL.igstAmount, r), `${cell(COL.igstTaxable, r)}*${igstFactor(pct)}`);
    return true;
  }
  for (const col of IGST_COLS) sheet.clear(cell(col, r));
  return false;
}

function summarize(
  report: FillReport,
  o: FillOptions,
  drawback: boolean,
  zeroIgst: boolean,
  paid: boolean,
): string[] {
  const unmatchedNote = report.unmatched
    ? `, ${report.unmatched} unmatched (duty columns left untouched)`
    : "";
  const lines = [`Filled ${report.rows} row(s): ${report.matched} matched duty data${unmatchedNote}.`];
  lines.push(
    drawback
      ? `Drawback columns filled on ${report.drawbackRows} row(s).`
      : "Drawback columns cleared on matched rows: scheme does not carry Drawback.",
  );
  if (o.rodtep !== "")
    lines.push(
      `RoDTEP "${o.rodtep}" written on ${report.matched} matched row(s); N/A where no RoDTEP entry exists.`,
    );
  lines.push(`IGST payment status "${o.paymentStatus}" written.`);
  if (zeroIgst) lines.push("Taxable value, IGST rate and amount set to 0.");
  if (paid) {
    const rateNote = o.currency ? `${o.currency.code} @ ${o.currency.exp}` : "the chosen currency";
    lines.push(`IGST filled on ${report.igstRows} row(s) using ${rateNote}.`);
  }
  return lines;
}
