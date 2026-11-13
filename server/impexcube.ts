import type { DbkRaw, DutyResponse, RodtepRaw } from "../shared/contract";

const SITE = "https://impexcube.in";
const DUTY_URL = `${SITE}/DutyStructureExport`;
const RATE_URL = `${SITE}/Home/LoadExRate`;
const RATE_PAGE = `${SITE}/Home/ExchangeRate`;
/** The userscript sent the literal string "null" as Country; kept to match the site. */
const UPSTREAM_COUNTRY = "null";
const TIMEOUT_MS = 12_000;

class UpstreamError extends Error {}

type Row = Record<string, unknown>;

async function call(url: string, body: unknown, referer?: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Accept: "application/json, text/plain, */*",
      ...(referer ? { Referer: referer, "X-Requested-With": "XMLHttpRequest" } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new UpstreamError(`ImpexCube responded HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (text === "" || text === '""') return [];
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UpstreamError("ImpexCube did not return JSON (is a login required?)");
  }
}

const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => typeof v === "object" && v !== null) : [];
const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value).trim());
const rateOf = (value: unknown): string | number => (typeof value === "number" ? value : str(value));

async function optionalRows(url: string, body: unknown): Promise<Row[]> {
  try {
    return rows(await call(url, body));
  } catch {
    return [];
  }
}

/** Calls the three duty endpoints and keeps only the fields the app reads. */
export async function fetchDutyStructure(hsn: string): Promise<DutyResponse> {
  const base = { RITC: hsn, Country: UPSTREAM_COUNTRY };
  const [first] = rows(await call(`${DUTY_URL}/FillDescription`, { ...base, Mode: "Description" }));
  if (!first) return { status: "no-data", hsn };
  const [dbk, rodetep] = await Promise.all([
    optionalRows(`${DUTY_URL}/FillDBK`, { ...base, Mode: "DBK" }),
    optionalRows(`${DUTY_URL}/GetDetails`, { ...base, Mode: "RODEP" }),
  ]);
  const dbkEntries: DbkRaw[] = dbk.map((r) => ({
    ActualDBK_SERNo: str(r.ActualDBK_SERNo),
    ActualDBK_Desc: str(r.ActualDBK_Desc),
    ActualDBKRate: rateOf(r.ActualDBKRate),
    ActualUnit: str(r.ActualUnit),
  }));
  const rodEntries: RodtepRaw[] = rodetep.map((r) => ({ RoDTEPUQC: str(r.RoDTEPUQC) }));
  return { status: "ok", hsn, uqc: str(first.StandardUQC) || "N/A", dbk: dbkEntries, rodetep: rodEntries };
}

/** Passed through unchanged; the client's rate parser validates each row. */
export function fetchExchangeRates(): Promise<unknown> {
  return call(RATE_URL, {}, RATE_PAGE);
}
