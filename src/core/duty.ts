import type { DutyResponse } from "../../shared/contract";
import { COL, cell, type SheetPort, text } from "./sheet";

type OkDuty = Extract<DutyResponse, { status: "ok" }>;

export interface DbkOption {
  srNo: string;
  desc: string;
  rate: string | number;
  unit: string;
}

export interface DutyRecord {
  hsn: string;
  uqc: string;
  dbk: DbkOption[];
  rodtepFound: boolean;
  rodtepUqc: string;
}

export function normalizeDuty(raw: OkDuty): DutyRecord {
  const withUqc = raw.rodetep.find((e) => text(e.RoDTEPUQC) !== "");
  return {
    hsn: raw.hsn,
    uqc: raw.uqc,
    dbk: raw.dbk.map((e) => ({
      srNo: text(e.ActualDBK_SERNo),
      desc: text(e.ActualDBK_Desc),
      rate: e.ActualDBKRate ?? "",
      unit: text(e.ActualUnit),
    })),
    rodtepFound: raw.rodetep.length > 0,
    rodtepUqc: withUqc ? text(withUqc.RoDTEPUQC).toUpperCase() : "",
  };
}

interface DbkGroup {
  key: string;
  label: string;
  entry: DbkOption | null;
  ambiguous: boolean;
  rows: number[];
}

type DbkPlanItem =
  | { mode: "nomatch" | "none" }
  | { mode: "single"; entry: DbkOption; detected: boolean }
  | { mode: "multi"; options: DbkOption[]; groups: DbkGroup[] };

export type DbkPlan = Record<string, DbkPlanItem>;

/** User choices: HSN -> group key -> option index (null = explicitly blank). */
export type Picks = Record<string, Record<string, number | null>>;

const GENERIC = "__generic__";

/** "Predominantly of marble" -> "marble"; "Others" -> null. */
export function extractMaterial(desc: string): string | null {
  const match = desc.trim().match(/\bof\b\s+([A-Za-z][A-Za-z\s/&-]*?)\s*[.:;,]*\s*$/i);
  const material = match?.[1]?.trim().toLowerCase() ?? "";
  return material.length >= 2 ? material : null;
}

export function buildDbkPlan(
  rowsByRitc: Record<string, number[]>,
  duty: Record<string, DutyRecord>,
  sheet: SheetPort,
): DbkPlan {
  const plan: DbkPlan = {};
  for (const [ritc, rows] of Object.entries(rowsByRitc)) {
    const rec = duty[ritc];
    if (!rec) {
      plan[ritc] = { mode: "nomatch" };
      continue;
    }
    const options = rec.dbk;
    const only = options[0];
    if (!only) {
      plan[ritc] = { mode: "none" };
      continue;
    }
    if (options.length === 1) {
      plan[ritc] = { mode: "single", entry: only, detected: false };
      continue;
    }
    // A DBK serial already written consistently to every row counts as an answer.
    const existing = rows.map((r) => text(sheet.get(cell(COL.dbkSr, r)))).filter((v) => v !== "");
    const first = existing[0];
    if (first !== undefined && existing.length === rows.length && existing.every((v) => v === first)) {
      const matched = options.find((e) => e.srNo === first);
      if (matched) {
        plan[ritc] = { mode: "single", entry: matched, detected: true };
        continue;
      }
    }
    plan[ritc] = { mode: "multi", options, groups: groupByMaterial(rows, options, sheet) };
  }
  return plan;
}

/** True when `word` appears as its own word (a plural -s is allowed), so "tin" does not match "knitting". */
function wholeWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}s?(?![a-z0-9])`).test(text);
}

function groupByMaterial(rows: number[], options: DbkOption[], sheet: SheetPort): DbkGroup[] {
  const materials = options.flatMap((entry) => {
    const material = extractMaterial(entry.desc);
    return material ? [{ entry, material }] : [];
  });
  const generic = options.filter((e) => extractMaterial(e.desc) === null);
  const groups = new Map<string, DbkGroup>();
  for (const r of rows) {
    const desc = text(sheet.get(cell(COL.description, r))).toLowerCase();
    const hit = materials.find((m) => wholeWord(desc, m.material));
    const key = hit ? hit.material : GENERIC;
    const group = groups.get(key) ?? {
      key,
      label: hit ? capitalize(hit.material) : "Other / unmatched material",
      entry: hit ? hit.entry : (generic[0] ?? null),
      ambiguous: !hit && generic.length > 1,
      rows: [],
    };
    group.rows.push(r);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Returns a new plan with the user's picks applied to multi-option groups. */
export function applyPicks(plan: DbkPlan, picks: Picks): DbkPlan {
  const next: DbkPlan = {};
  for (const [ritc, item] of Object.entries(plan)) {
    if (item.mode !== "multi") {
      next[ritc] = item;
      continue;
    }
    const chosen: Record<string, number | null | undefined> = picks[ritc] ?? {};
    const groups = item.groups.map((g) => {
      if (!(g.key in chosen)) return g;
      const idx = chosen[g.key];
      return { ...g, entry: idx === null || idx === undefined ? null : (item.options[idx] ?? null) };
    });
    next[ritc] = { ...item, groups };
  }
  return next;
}

export function resolveDbkEntry(plan: DbkPlan, ritc: string, row: number): DbkOption | null {
  const item = plan[ritc];
  if (!item) return null;
  if (item.mode === "single") return item.entry;
  if (item.mode === "multi") return item.groups.find((g) => g.rows.includes(row))?.entry ?? null;
  return null;
}
