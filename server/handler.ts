import { API, type ApiError } from "../shared/contract";
import { fetchDutyStructure, fetchExchangeRates } from "./impexcube";

const MAX_BODY_CHARS = 512;
/** Digits and dots only, and must start with a digit. */
const HSN_PATTERN = /^\d[\d.]{1,15}$/;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const failure = (error: string, status: number): Response => json({ error } satisfies ApiError, status);

async function readHsn(request: Request): Promise<string | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return null;
  try {
    const hsn = (JSON.parse(text) as { hsn?: unknown } | null)?.hsn;
    const clean = typeof hsn === "string" ? hsn.trim() : "";
    return HSN_PATTERN.test(clean) ? clean : null;
  } catch {
    return null;
  }
}

/**
 * Plain Web-standard handler: Request in, Response out. It has no platform imports, so any
 * runtime with fetch-style handlers can host it. functions/ and server/serve.ts are thin adapters.
 */
export async function handleApi(request: Request): Promise<Response> {
  if (request.method !== "POST") return failure("method not allowed", 405);
  const { pathname } = new URL(request.url);
  try {
    if (pathname === API.duty) {
      const hsn = await readHsn(request);
      return hsn ? json(await fetchDutyStructure(hsn)) : failure("invalid HSN code", 400);
    }
    if (pathname === API.exchangeRates) {
      return json(await fetchExchangeRates(), 200, { "Cache-Control": "public, max-age=900" });
    }
    return failure("not found", 404);
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    const message = err instanceof Error ? err.message : "unknown error";
    return failure(message, timedOut ? 504 : 502);
  }
}
