import { computed, signal } from "@preact/signals";
import { applyPicks, buildDbkPlan, type DbkPlan, type DutyRecord, type Picks } from "../core/duty";
import { type Blocker, type FillOptions, fillBlockers, fillWorkbook, type ShipmentForm } from "../core/fill";
import type { CurrencyRate } from "../core/rates";
import {
  type Overrides,
  type ReviewColumn,
  reviewAddresses,
  reviewColumns,
  type Snapshot,
} from "../core/review";
import { consistentValue } from "../core/scan";
import { COL, findColumn } from "../core/sheet";
import { delay, fetchDuty, fetchRates } from "../io/api";
import type { Loaded } from "../io/workbook";

/** SheetJS is large, so it loads only when a workbook is opened or written. */
const io = () => import("../io/workbook");

export const YES_NO = ["Yes", "No"] as const;
export const RODTEP_CHOICES = ["Yes", "No"] as const;
const INTER_REQUEST_MS = 500;
const SPREADSHEET = /\.(xlsx|xls)$/i;
const LOG_LIMIT = 200;

const EMPTY_FORM: ShipmentForm = {
  scheme: "19-Drawback (DBK)",
  endUse: "GNX100",
  fta: "NCPTI",
  reward: "Yes",
  rodtep: "Yes",
  state: "",
  district: "",
  country: "",
  paymentStatus: "",
  currency: null,
  igstPercent: {},
};

export interface LogLine {
  id: number;
  level: "info" | "ok" | "warn" | "err";
  message: string;
}

export type DutyStatus = "ok" | "no-data" | "failed";

export const workbook = signal<Loaded | null>(null);
export const loadError = signal<string | null>(null);
export const form = signal<ShipmentForm>(EMPTY_FORM);
export const manual = signal({ code: "", rate: "" });
export const rates = signal<CurrencyRate[]>([]);
export const ratesLoading = signal(false);
export const duty = signal<Record<string, DutyRecord>>({});
/** Outcome of the last lookup per HSN code, so a code with no data is visible instead of silently absent. */
export const dutyStatus = signal<Record<string, DutyStatus>>({});
export const dutyProgress = signal<{ done: number; total: number } | null>(null);
export const output = signal<Blob | null>(null);
export interface Review {
  rows: number[];
  columns: ReviewColumn[];
  /** Watched cells in the original file and right after the fill, before manual edits. */
  before: Snapshot;
  after: Snapshot;
}

/** The last fill's table. Overrides are separate, so a repeat fill can rebuild this and keep the edits. */
export const review = signal<Review | null>(null);
/** Manual edits by cell address (typed text). Survive a repeat fill; dropped when another file loads. */
/** True while the left sheet shows the filled rows instead of the form. */
export const reviewing = signal(false);
export const overrides = signal<Overrides>({});
export const logLines = signal<LogLine[]>([]);
/** Turned on by the first Apply attempt, so empty required fields are only flagged once the user has tried. */
export const showErrors = signal(false);
const picks = signal<Picks>({});

/** Bumped when a new file replaces the current one, so a lookup started for an older file can tell it is stale. */
let generation = 0;
/** Bumped on every load attempt, so only the newest attempt may replace the workbook. */
let loadToken = 0;
let stopRequested = false;
/** Options of the last fill, so edits can rebuild the file without asking the form again. */
let applied: FillOptions | null = null;
let buildSeq = 0;
let latestBuild: Promise<void> = Promise.resolve();
let logId = 0;

export const plan = computed<DbkPlan>(() => {
  const wb = workbook.value;
  if (!wb) return {};
  return applyPicks(buildDbkPlan(wb.index.rowsByRitc, duty.value, wb.sheet), picks.value);
});

const options = computed<FillOptions>(() => {
  const f = form.value;
  return {
    ...f,
    scheme: f.scheme.trim(),
    endUse: f.endUse.trim(),
    fta: (f.fta ?? "").trim(),
    paymentStatus: f.paymentStatus.trim(),
    plan: plan.value,
    duty: duty.value,
  };
});

export const blockers = computed<Blocker[]>(() => {
  const wb = workbook.value;
  if (!wb) return [{ id: "file", message: "Upload a ProductFormat.xlsx file or paste a table." }];
  return fillBlockers(options.value, Object.keys(wb.index.rowsByRitc));
});

/** First blocker message per field id, for inline error text. */
export const blockerById = computed<Record<string, string>>(() => {
  const byId: Record<string, string> = {};
  for (const b of blockers.value) byId[b.id] ??= b.message;
  return byId;
});

/** Number of open blockers for a field id or any id under it (`dbk` covers `dbk:9403:marble`). */
export const pendingIn = (...ids: string[]): number =>
  blockers.value.filter((b) => ids.some((id) => b.id === id || b.id.startsWith(`${id}:`))).length;

/** Things that do not stop a fill but change what it writes. */
export const warnings = computed<string[]>(() => {
  const wb = workbook.value;
  if (!wb) return [];
  const notes: string[] = [];
  const codes = Object.keys(wb.index.rowsByRitc);
  const status = dutyStatus.value;
  const looked = Object.keys(status).length > 0;
  const unresolved = codes.filter((c) => status[c] !== "ok");
  if (wb.index.blankRitcRows > 0) {
    notes.push(`${wb.index.blankRitcRows} row(s) have no HSN code, so they get no duty data.`);
  }
  if (codes.length > 0 && !looked && !dutyProgress.value) {
    notes.push("Duty data not fetched yet. DBK, RoDTEP and UQC columns stay as in the file.");
  } else if (looked && unresolved.length > 0 && !dutyProgress.value) {
    notes.push(`No duty data for ${unresolved.join(", ")}. Those rows keep their file values.`);
  }
  return notes;
});

function say(level: LogLine["level"], message: string): void {
  logLines.value = [...logLines.value.slice(-(LOG_LIMIT - 1)), { id: ++logId, level, message }];
}

export const clearLog = (): void => {
  logLines.value = [];
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function prefill(wb: Loaded): ShipmentForm {
  const read = (col: string) => consistentValue(wb.sheet, wb.index.dataRows, col);
  const payment = read(COL.paymentStatus);
  const reward = read(COL.reward);
  const ftaCol = findColumn(wb.sheet, "FTACode");
  return {
    ...EMPTY_FORM,
    scheme: read(COL.scheme) || EMPTY_FORM.scheme,
    endUse: read(COL.endUse) || EMPTY_FORM.endUse,
    reward: YES_NO.some((y) => y === reward) ? reward : EMPTY_FORM.reward,
    fta: ftaCol ? read(ftaCol) || EMPTY_FORM.fta : EMPTY_FORM.fta,
    state: read(COL.state),
    district: read(COL.district),
    country: read(COL.country),
    paymentStatus: wb.guidelines.paymentStatusCodes.includes(payment) ? payment : "LUT",
  };
}

export async function loadFile(file: File): Promise<void> {
  const token = ++loadToken;
  loadError.value = null;
  const fail = (message: string) => {
    loadError.value = message;
    say("err", message);
  };
  if (!SPREADSHEET.test(file.name)) {
    fail(`${file.name} is not a spreadsheet. Choose the ProductFormat .xlsx file.`);
    return;
  }
  try {
    const { openWorkbook } = await io();
    const wb = await openWorkbook(file);
    // A newer attempt started while this one was reading: let that one win.
    if (token !== loadToken) return;
    adopt(wb);
  } catch (err) {
    if (token === loadToken) fail(`Could not read ${file.name}: ${errorText(err)}`);
  }
}

/** Opens a table copied from Excel; it goes through the same path as an uploaded file. */
export async function loadPasted(text: string): Promise<void> {
  const token = ++loadToken;
  loadError.value = null;
  try {
    const { openPastedTable } = await io();
    const wb = openPastedTable(text);
    if (token !== loadToken) return;
    adopt(wb);
  } catch (err) {
    if (token !== loadToken) return;
    const message = `Could not use the pasted table: ${errorText(err)}`;
    loadError.value = message;
    say("err", message);
  }
}

/** Replaces the current workbook and resets everything derived from it. */
function adopt(wb: Loaded): void {
  loadError.value = null;
  // Only now is the previous file really being replaced, so only now is its lookup stale.
  generation++;
  stopRequested = true;
  dutyProgress.value = null;
  workbook.value = wb;
  duty.value = {};
  dutyStatus.value = {};
  picks.value = {};
  output.value = null;
  review.value = null;
  reviewing.value = false;
  overrides.value = {};
  applied = null;
  showErrors.value = false;
  manual.value = { code: "", rate: "" };
  form.value = prefill(wb);
  say(
    "ok",
    `Parsed ${wb.fileName}: ${wb.index.dataRows.length} row(s), ${Object.keys(wb.index.rowsByRitc).length} HSN code(s).`,
  );
  for (const w of wb.warnings) say("warn", w);
}

export function setField<K extends keyof ShipmentForm>(key: K, value: ShipmentForm[K]): void {
  form.value = { ...form.value, [key]: value };
  output.value = null;
}

export function setState(code: string): void {
  form.value = { ...form.value, state: code, district: "" };
  output.value = null;
}

export function setIgstPercent(ritc: string, percent: number | undefined): void {
  form.value = { ...form.value, igstPercent: { ...form.value.igstPercent, [ritc]: percent } };
  output.value = null;
}

export function setPick(ritc: string, groupKey: string, index: number | null): void {
  picks.value = { ...picks.value, [ritc]: { ...picks.value[ritc], [groupKey]: index } };
  output.value = null;
}

/** Live and manual currency are one choice: picking one clears the other. */
export function pickLiveCurrency(code: string): void {
  manual.value = { code: "", rate: "" };
  setField("currency", rates.value.find((c) => c.code === code) ?? null);
}

export function setManual(code: string, rate: string): void {
  manual.value = { code, rate };
  const cleanCode = code.trim().toUpperCase();
  const exp = Number.parseFloat(rate);
  setField("currency", cleanCode && exp > 0 ? { name: cleanCode, code: cleanCode, exp } : null);
}

export function choosePayment(value: string): void {
  setField("paymentStatus", value);
  if (value === "P" && rates.value.length === 0) void loadRates();
}

export async function loadRates(): Promise<void> {
  if (ratesLoading.value) return;
  ratesLoading.value = true;
  try {
    const list = await fetchRates();
    rates.value = list;
    say(
      list.length ? "ok" : "warn",
      list.length
        ? `Loaded ${list.length} currency rate(s).`
        : "ImpexCube returned no currency rows. Enter the rate manually.",
    );
  } catch (err) {
    rates.value = [];
    say("warn", `Live rates unavailable (${errorText(err)}). Enter the currency and rate manually.`);
  } finally {
    ratesLoading.value = false;
  }
}

export function stopDuty(): void {
  stopRequested = true;
}

export async function fetchAllDuty(): Promise<void> {
  const wb = workbook.value;
  if (!wb || dutyProgress.value) return;
  const codes = Object.keys(wb.index.rowsByRitc);
  if (codes.length === 0) return;

  const gen = generation;
  const isCurrent = () => gen === generation;
  stopRequested = false;
  const tally = { ok: 0, noData: 0, failed: 0 };
  const record = (hsn: string, status: DutyStatus, found?: DutyRecord) => {
    const next = { ...duty.value };
    // A failed refetch keeps the earlier answer; "no data" is an answer and replaces it.
    if (found) next[hsn] = found;
    else if (status === "no-data") delete next[hsn];
    duty.value = next;
    dutyStatus.value = { ...dutyStatus.value, [hsn]: status };
    output.value = null;
  };
  dutyProgress.value = { done: 0, total: codes.length };
  say("info", `Fetching duty data for ${codes.length} HSN code(s)…`);

  try {
    for (const [i, hsn] of codes.entries()) {
      if (!isCurrent()) return;
      if (stopRequested) {
        say("warn", "Stopped by user.");
        break;
      }
      const res = await fetchDuty(hsn);
      if (!isCurrent()) return;
      if (res.status === "ok") {
        record(hsn, "ok", res.record);
        tally.ok++;
        say(
          "ok",
          `${hsn}: ${res.record.dbk.length} DBK option(s), UQC ${res.record.uqc}, RoDTEP ${res.record.rodtepFound ? "yes" : "no"}.`,
        );
      } else if (res.status === "no-data") {
        record(hsn, "no-data");
        tally.noData++;
        say("warn", `${hsn}: no duty data returned.`);
      } else {
        record(hsn, "failed");
        tally.failed++;
        say("err", `${hsn} failed: ${res.reason}`);
      }
      dutyProgress.value = { done: i + 1, total: codes.length };
      if (i < codes.length - 1 && !stopRequested) await delay(INTER_REQUEST_MS);
    }
  } finally {
    if (isCurrent()) dutyProgress.value = null;
  }
  if (!isCurrent()) return;
  say(
    tally.failed ? "warn" : "ok",
    `Duty lookup finished: ${tally.ok} ok, ${tally.noData} no data, ${tally.failed} failed.`,
  );
}

const scrollToTop = (): void => {
  if (typeof window !== "undefined") window.scrollTo?.(0, 0);
};

/** Returns from the review view to the form. Values and manual edits stay as they were. */
export function backToForm(): void {
  reviewing.value = false;
  scrollToTop();
}

const plural = (n: number): string => `${n} manual edit${n === 1 ? "" : "s"}`;

export async function applyFill(): Promise<void> {
  const wb = workbook.value;
  if (!wb || blockers.value.length > 0) return;
  const opts = options.value;
  const columns = reviewColumns(
    opts.paymentStatus === "P",
    opts.fta ? findColumn(wb.sheet, "FTACode") : undefined,
  );
  try {
    const { fillAndBuild } = await io();
    const { blob, result, before, after } = fillAndBuild(
      wb,
      (sheet, rows) => fillWorkbook(sheet, rows, opts),
      {
        overrides: overrides.value,
        watch: reviewAddresses(wb.index.dataRows, columns),
      },
    );
    if (workbook.value !== wb) return;
    // Only the headline line carries the warning; the detail lines are just facts.
    result.summary.forEach((line, i) => say(i === 0 && result.unmatched ? "warn" : "ok", line));
    // An edit that now equals the fresh fill is no longer an edit.
    const kept = Object.fromEntries(
      Object.entries(overrides.value).filter(([a, v]) => v !== (after[a] ?? "")),
    );
    const keptCount = Object.keys(kept).length;
    if (keptCount > 0) say("ok", `Kept ${plural(keptCount)}.`);
    overrides.value = kept;
    applied = opts;
    buildSeq++;
    review.value = { rows: wb.index.dataRows, columns, before, after };
    output.value = blob;
    reviewing.value = true;
    showErrors.value = false;
    scrollToTop();
  } catch (err) {
    say("err", `Could not build the workbook: ${errorText(err)}`);
  }
}

/** Rebuilds the file from the last fill plus the current edits. Only the newest rebuild may publish. */
async function rebuildOutput(): Promise<void> {
  const wb = workbook.value;
  const opts = applied;
  const r = review.value;
  if (!wb || !opts || !r || output.value === null) return;
  const seq = ++buildSeq;
  try {
    const { fillAndBuild } = await io();
    const { blob } = fillAndBuild(wb, (sheet, rows) => fillWorkbook(sheet, rows, opts), {
      overrides: overrides.value,
    });
    if (seq === buildSeq && workbook.value === wb && output.value !== null) output.value = blob;
  } catch (err) {
    say("err", `Could not apply the edit: ${errorText(err)}`);
  }
}

/** Records a manual edit of a filled cell. Typing the filled value back removes the edit. */
export function setOverride(address: string, raw: string): void {
  const r = review.value;
  if (!r) return;
  const typed = raw.trim();
  const next = { ...overrides.value };
  if (typed === (r.after[address] ?? "")) delete next[address];
  else next[address] = typed;
  if ((next[address] ?? undefined) === overrides.value[address]) return;
  overrides.value = next;
  latestBuild = rebuildOutput();
}

export function resetOverride(address: string): void {
  if (!(address in overrides.value)) return;
  const { [address]: _gone, ...rest } = overrides.value;
  overrides.value = rest;
  latestBuild = rebuildOutput();
}

/** Resolves once the file reflects every edit made so far. */
export const outputSettled = (): Promise<void> => latestBuild;

export async function downloadOutput(): Promise<void> {
  const wb = workbook.value;
  if (!wb) return;
  await outputSettled();
  const blob = output.value;
  if (!blob) return;
  const { download, outputName } = await io();
  download(blob, outputName(wb.fileName));
}
