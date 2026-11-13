import { API, type ApiError, type DutyResponse } from "../../shared/contract";
import { type DutyRecord, normalizeDuty } from "../core/duty";
import { type CurrencyRate, parseExchangeRates } from "../core/rates";

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type DutyResult =
  | { status: "ok"; record: DutyRecord }
  | { status: "no-data" }
  | { status: "failed"; reason: string };

class ApiFailure extends Error {
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Timeouts, network errors and 5xx are worth one more try. A 4xx will fail the same way again. */
const isTransient = (err: unknown): boolean => !(err instanceof ApiFailure) || (err.status ?? 500) >= 500;

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiFailure((data as Partial<ApiError> | null)?.error ?? `HTTP ${res.status}`, res.status);
  return data;
}

function reasonOf(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError") return "timed out";
  return err instanceof Error ? err.message : "unknown error";
}

/** One attempt, plus one retry after a short pause, mirroring the userscript. */
export async function fetchDuty(hsn: string): Promise<DutyResult> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = (await postJson(API.duty, { hsn })) as DutyResponse;
      return res.status === "ok" ? { status: "ok", record: normalizeDuty(res) } : { status: "no-data" };
    } catch (err) {
      last = err;
      if (!isTransient(err)) break;
      if (attempt === 0) await delay(RETRY_DELAY_MS);
    }
  }
  return { status: "failed", reason: reasonOf(last) };
}

export async function fetchRates(): Promise<CurrencyRate[]> {
  return parseExchangeRates(await postJson(API.exchangeRates, {}));
}
