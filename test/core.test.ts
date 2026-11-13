import { describe, expect, test } from "bun:test";
import { applyPicks, buildDbkPlan, extractMaterial, resolveDbkEntry } from "../src/core/duty";
import { type FillOptions, fillBlockers, fillWorkbook, isDrawbackScheme } from "../src/core/fill";
import { igstFactor, parseExchangeRates } from "../src/core/rates";
import { applyOverrides, parseEdit, reviewColumns } from "../src/core/review";
import { indexRows, readGuidelines } from "../src/core/scan";
import type { SheetPort } from "../src/core/sheet";
import { DUTY } from "./fixtures";

type Entry = { v: string | number } | { f: string };

/** In-memory SheetPort with a formula lookup so tests can assert formulas. */
function memorySheet(init: Record<string, string | number> = {}) {
  const cells = new Map<string, Entry>(Object.entries(init).map(([a, v]) => [a, { v }]));
  const port: SheetPort = {
    get: (a) => {
      const c = cells.get(a);
      return c && "v" in c ? c.v : undefined;
    },
    setValue: (a, v) => {
      cells.set(a, { v });
    },
    setFormula: (a, f) => {
      cells.set(a, { f });
    },
    clear: (a) => {
      cells.delete(a);
    },
  };
  const formula = (a: string) => {
    const c = cells.get(a);
    return c && "f" in c ? c.f : undefined;
  };
  return { port, formula };
}

const BASE: FillOptions = {
  scheme: "19-Drawback (DBK)",
  endUse: "GNX100",
  reward: "Yes",
  rodtep: "Yes",
  state: "",
  district: "",
  country: "",
  paymentStatus: "LUT",
  currency: null,
  igstPercent: {},
  plan: {},
  duty: DUTY,
};

const SHEET = {
  B2: 1,
  B3: 2,
  B4: 3,
  K2: "9403",
  D2: "statue of marble",
  M2: 5,
  N2: "NOS",
  P2: "OLD",
  K3: "9403",
  D3: "lamp of brass",
  M3: 3,
  N3: "NOS",
  K4: "9999",
  D4: "unknown item",
  P4: "KEEP",
  AJ4: "Yes",
  U4: "77",
};

function planFor(port: SheetPort, rows: Record<string, number[]>) {
  return applyPicks(buildDbkPlan(rows, DUTY, port), {});
}

describe("schemes and materials", () => {
  test("drawback scheme detection uses the leading code", () => {
    expect(isDrawbackScheme("19-Drawback (DBK)")).toBe(true);
    expect(isDrawbackScheme("41")).toBe(true);
    expect(isDrawbackScheme("00-Free Shipping bill")).toBe(false);
    expect(isDrawbackScheme("")).toBe(false);
  });

  test("material extraction", () => {
    expect(extractMaterial("Predominantly of marble")).toBe("marble");
    expect(extractMaterial("Of Brass.")).toBe("brass");
    expect(extractMaterial("Others")).toBeNull();
  });
});

describe("DBK planning", () => {
  test("groups rows by material with a generic fallback", () => {
    const { port } = memorySheet({ D2: "statue of marble", D3: "brass lamp", D4: "misc" });
    const plan = buildDbkPlan({ "9403": [2, 3, 4] }, DUTY, port);
    const item = plan["9403"];
    if (item?.mode !== "multi") throw new Error("expected a multi plan");
    expect(item.groups.map((g) => [g.key, g.entry?.srNo])).toEqual([
      ["marble", "10"],
      ["brass", "11"],
      ["__generic__", "12"],
    ]);
  });

  test("a consistent existing DBK serial counts as detected", () => {
    const { port } = memorySheet({ D2: "a of marble", D3: "b of brass", U2: "11", U3: "11" });
    const plan = buildDbkPlan({ "9403": [2, 3] }, DUTY, port);
    expect(plan["9403"]).toMatchObject({ mode: "single", detected: true, entry: { srNo: "11" } });
  });

  test("picks override groups, and a blank pick clears the entry", () => {
    const { port } = memorySheet({ D2: "a of marble", D3: "x" });
    const plan = buildDbkPlan({ "9403": [2, 3] }, DUTY, port);
    const picked = applyPicks(plan, { "9403": { marble: 2 } });
    expect(resolveDbkEntry(picked, "9403", 2)?.srNo).toBe("12");
    const blanked = applyPicks(plan, { "9403": { marble: null } });
    expect(resolveDbkEntry(blanked, "9403", 2)).toBeNull();
  });
});

describe("rates and IGST", () => {
  test("parses wrapped and bare payloads and drops invalid rows", () => {
    const rows = [
      { CurrencyName: "US  DOLLARS", CurrencyCode: "usd", Export: "95.10" },
      { CurrencyName: "X", CurrencyCode: "XX", Export: "n/a" },
    ];
    expect(parseExchangeRates(rows)).toEqual([{ name: "US DOLLARS", code: "USD", exp: 95.1 }]);
    expect(parseExchangeRates({ d: JSON.stringify(rows) })).toHaveLength(1);
    expect(parseExchangeRates({ data: rows })).toHaveLength(1);
  });

  test("IGST factor is a plain decimal", () => {
    expect(igstFactor(5)).toBe("0.05");
    expect(igstFactor(18)).toBe("0.18");
    expect(igstFactor(40)).toBe("0.4");
  });
});

describe("scanning", () => {
  test("indexRows groups by RITC and counts blank codes", () => {
    const { port, formula } = memorySheet({ B2: 1, K2: "9403", B3: 2, B4: 3, K4: "9403", B5: "" });
    const index = indexRows(port, 1, 5);
    expect(index.dataRows).toEqual([2, 3, 4]);
    expect(index.rowsByRitc).toEqual({ "9403": [2, 4] });
    expect(index.blankRitcRows).toBe(1);
  });

  test("guidelines fall back to defaults when the sheet is absent", () => {
    const g = readGuidelines(null, 0);
    expect(g.schemeCodes).toContain("19-Drawback (DBK)");
    expect(g.endUseCodes[0]).toBe("GNX100");
    expect(g.endUseCodes).toContain("LVP730");
    expect(g.paymentStatusCodes).toEqual(["NA", "LUT", "P"]);
  });
});

describe("fillWorkbook", () => {
  test("drawback, RoDTEP and zero IGST; unmatched rows keep their duty values", () => {
    const { port, formula } = memorySheet(SHEET);
    const rows = indexRows(port, 1, 4).dataRows;
    const report = fillWorkbook(port, rows, {
      ...BASE,
      plan: planFor(port, indexRows(port, 1, 4).rowsByRitc),
    });

    expect(report).toMatchObject({ matched: 2, unmatched: 1, drawbackRows: 2 });
    expect(port.get("U2")).toBe("10");
    expect(port.get("W2")).toBe(1.5);
    expect(port.get("X2")).toBe("KGS");
    expect(formula("V2")).toBe("M2");
    expect(formula("O2")).toBe("M2");
    expect(port.get("AJ2")).toBe("Yes");
    expect(port.get("AJ3")).toBe("Yes");
    expect(formula("AK2")).toBe("M2");
    expect(port.get("U3")).toBe("11");
    expect(port.get("W3")).toBe(2);
    expect(formula("V3")).toBe("O3");
    expect(port.get("AF2")).toBe(0);
    expect(port.get("L4")).toBe("19-Drawback (DBK)");

    expect(port.get("P4")).toBe("KEEP");
    expect(port.get("AJ4")).toBe("Yes");
    expect(port.get("U4")).toBe("77");
  });

  test("a non-drawback scheme clears duty columns on matched rows only", () => {
    const { port } = memorySheet({ ...SHEET, U2: "10", W2: 1, X2: "KGS" });
    const index = indexRows(port, 1, 4);
    fillWorkbook(port, index.dataRows, {
      ...BASE,
      scheme: "00-Free Shipping bill",
      plan: planFor(port, index.rowsByRitc),
    });
    expect(port.get("U2")).toBeUndefined();
    expect(port.get("W2")).toBeUndefined();
    expect(port.get("U4")).toBe("77");
  });

  test("payment P writes live-rate formulas and per-HSN IGST", () => {
    const { port, formula } = memorySheet(SHEET);
    const index = indexRows(port, 1, 4);
    const opts: FillOptions = {
      ...BASE,
      plan: planFor(port, index.rowsByRitc),
      paymentStatus: "P",
      currency: { name: "US DOLLARS", code: "USD", exp: 95.1 },
      igstPercent: { "9403": 18 },
    };
    fillWorkbook(port, index.dataRows, opts);
    expect(formula("AF2")).toBe("R2*95.1");
    expect(port.get("AG2")).toBe(18);
    expect(formula("AH2")).toBe("AF2*0.18");
    expect(port.get("AF4")).toBeUndefined();
  });
});

describe("fillBlockers", () => {
  test("explains what is missing instead of failing silently", () => {
    const { port } = memorySheet(SHEET);
    const index = indexRows(port, 1, 4);
    const plan = planFor(port, index.rowsByRitc);
    const blockers = fillBlockers(
      { ...BASE, scheme: "", paymentStatus: "P", currency: null, plan },
      Object.keys(index.rowsByRitc),
    );
    expect(blockers).toEqual([
      { id: "scheme", message: "Choose a Scheme Code." },
      { id: "currency", message: "Choose a currency for IGST." },
      { id: "igst:9403", message: "Choose an IGST rate for HSN 9403." },
      { id: "igst:9999", message: "Choose an IGST rate for HSN 9999." },
    ]);
  });

  test("an unpicked DBK group blocks a drawback fill", () => {
    const { port } = memorySheet({ D2: "a of marble" });
    const plan = applyPicks(buildDbkPlan({ "9403": [2] }, DUTY, port), { "9403": { marble: null } });
    expect(fillBlockers({ ...BASE, plan }, ["9403"])).toEqual([
      { id: "dbk:9403:marble", message: "Choose a DBK option for HSN 9403 (Marble)." },
    ]);
    expect(fillBlockers({ ...BASE, scheme: "00-Free Shipping bill", plan }, ["9403"])).toEqual([]);
  });
});

describe("manual overrides", () => {
  test("typed text becomes a number, a formula, a clear, or text", () => {
    expect(parseEdit("W2", " 2.5 ")).toEqual({ kind: "value", value: 2.5 });
    expect(parseEdit("V2", "=M2*2")).toEqual({ kind: "formula", formula: "M2*2" });
    expect(parseEdit("U2", "")).toEqual({ kind: "clear" });
    expect(parseEdit("X2", "KGS")).toEqual({ kind: "value", value: "KGS" });
    // Codes keep their leading zeros and the HSN column stays text.
    expect(parseEdit("U2", "0101")).toEqual({ kind: "value", value: "0101" });
    expect(parseEdit("K2", "9403")).toEqual({ kind: "value", value: "9403" });
  });

  test("applyOverrides writes values, formulas and clears through the sheet port", () => {
    const { port, formula } = memorySheet({ W2: 1.5, U2: "10", X2: "KGS" });
    applyOverrides(port, { W2: "3", V2: "=M2", U2: "", X2: "NOS" });
    expect(port.get("W2")).toBe(3);
    expect(formula("V2")).toBe("M2");
    expect(port.get("U2")).toBeUndefined();
    expect(port.get("X2")).toBe("NOS");
  });

  test("IGST columns are reviewed only when IGST is paid", () => {
    const letters = (paid: boolean) => reviewColumns(paid).map((c) => c.col);
    expect(letters(false)).not.toContain("AF");
    expect(letters(true)).toEqual(expect.arrayContaining(["AF", "AG", "AH"]));
    expect(letters(false)).toEqual(expect.arrayContaining(["K", "D", "M", "N", "U", "W", "X", "AJ"]));
  });
});

describe("RoDTEP choice", () => {
  test("Yes becomes N/A without RoDTEP data, No is written as is", () => {
    for (const [choice, row2, row3] of [
      ["Yes", "Yes", "N/A"],
      ["No", "No", "No"],
    ] as const) {
      const { port, formula } = memorySheet({
        B2: 1,
        K2: "9403",
        M2: 4,
        B3: 2,
        K3: "7318",
        M3: 6,
        AK3: "=O3",
      });
      const index = indexRows(port, 1, 3);
      fillWorkbook(port, index.dataRows, { ...BASE, rodtep: choice, plan: planFor(port, index.rowsByRitc) });
      expect([port.get("AJ2"), port.get("AJ3")]).toEqual([row2, row3]);
      expect(formula("AK2") === "M2").toBe(choice === "Yes");
      expect(formula("AK3")).toBeUndefined();
    }
  });
});

describe("audit fixes", () => {
  test("material match needs a whole word", () => {
    const { port } = memorySheet({ D2: "knitting needles", D3: "tin box", D4: "marbles top" });
    const plan = buildDbkPlan({ "9403": [2, 3, 4] }, DUTY, port)["9403"];
    if (plan?.mode !== "multi") throw new Error("expected multi");
    const keyOf = (r: number) => plan.groups.find((g) => g.rows.includes(r))?.key;
    expect(keyOf(2)).toBe("__generic__");
    expect(keyOf(4)).toBe("marble");
  });

  test("choosing a state clears the file's old district", () => {
    const { port } = memorySheet({ ...SHEET, AE2: "OLD-DIST" });
    const index = indexRows(port, 1, 4);
    fillWorkbook(port, index.dataRows, { ...BASE, state: "29", plan: planFor(port, index.rowsByRitc) });
    expect(port.get("AE2")).toBeUndefined();
    expect(port.get("AD2")).toBe("29");
  });
});
