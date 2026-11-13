import { text } from "./sheet";

export interface CurrencyRate {
  name: string;
  code: string;
  /** EXP rate (INR per unit of currency). */
  exp: number;
}

export const IGST_PERCENTS = [5, 18, 40] as const;

/** 5 -> "0.05", 18 -> "0.18": the decimal multiplier written into the IGST amount formula. */
export function igstFactor(percent: number): string {
  return String(Number((percent / 100).toFixed(6)));
}

function unwrapRows(value: unknown): unknown[] {
  // ASP.NET may return a bare array, a JSON string of the array, or {d: ...} / {data: ...}.
  if (typeof value === "string") {
    try {
      return unwrapRows(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return unwrapRows(o.d ?? o.data ?? []);
  }
  return [];
}

export function parseExchangeRates(data: unknown): CurrencyRate[] {
  return unwrapRows(data).flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const name = text(r.CurrencyName).replace(/\s+/g, " ");
    const code = text(r.CurrencyCode).toUpperCase();
    const exp = Number.parseFloat(text(r.Export));
    return name && code && !Number.isNaN(exp) ? [{ name, code, exp }] : [];
  });
}
