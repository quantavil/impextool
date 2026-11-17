import { expect, test } from "bun:test";
import { evaluateFormula } from "../src/core/formula";

const CELLS: Record<string, string | number> = { M2: 10, Q2: 2.5, N2: "PCS", AF2: 1000, T2: "abc" };
const valueAt = (address: string) => CELLS[address];

test.each([
  ["M2*Q2", 25],
  ["AF2*0.18", 180],
  ["(M2+2)*2", 24],
  ["-M2/4", -2.5],
  ["M2-Z9", 10],
  ["N2", "PCS"],
  ["Z9", 0],
])("%s evaluates to %p", (formula, expected) => {
  expect(evaluateFormula(formula, valueAt)).toBe(expected);
});

test.each(["T2*2", "M2/0", "SUM(M2)", "M2&Q2", "M2*"])("%s cannot be worked out", (formula) => {
  expect(evaluateFormula(formula, valueAt)).toBeUndefined();
});
