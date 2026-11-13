/** API routes, served by server/handler.ts and called by the browser app. */
export const API = {
  duty: "/api/duty",
  exchangeRates: "/api/exchange-rates",
} as const;

export type DbkRaw = {
  ActualDBK_SERNo?: string;
  ActualDBK_Desc?: string;
  ActualDBKRate?: string | number;
  ActualUnit?: string;
};

export type RodtepRaw = { RoDTEPUQC?: string | null };

export type DutyResponse =
  | { status: "ok"; hsn: string; uqc: string; dbk: DbkRaw[]; rodetep: RodtepRaw[] }
  | { status: "no-data"; hsn: string };

export type ApiError = { error: string };
