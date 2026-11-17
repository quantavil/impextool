/** Value of one cell as a formula sees it. Undefined means blank. */
export type ValueAt = (address: string) => string | number | undefined;

type Token = { num: number } | { ref: string } | { op: string };

const TOKEN = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|(\$?[A-Z]{1,3}\$?\d+)|([-+*/()]))/iy;

function tokenize(formula: string): Token[] | undefined {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < formula.length) {
    if (formula.slice(pos).trim() === "") break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(formula);
    if (!m) return undefined;
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) tokens.push({ num: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ ref: m[2].replace(/\$/g, "").toUpperCase() });
    else tokens.push({ op: m[3] ?? "" });
  }
  return tokens;
}

/** Blank counts as 0; text that is not a number is an error (null). */
function toNumber(value: string | number | undefined): number | null {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  const text = value.trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : null;
}

/**
 * Works out the value of a formula made of cell references, numbers, + - * / and parentheses,
 * such as "M2*Q2" or "AF2*0.18". A lone reference copies its cell. Returns undefined for anything else.
 */
export function evaluateFormula(formula: string, valueAt: ValueAt): string | number | undefined {
  const tokens = tokenize(formula);
  if (!tokens || tokens.length === 0) return undefined;
  const only = tokens[0];
  if (tokens.length === 1 && only && "ref" in only) return valueAt(only.ref) ?? 0;

  let pos = 0;
  const isOp = (op: string): boolean => {
    const t = tokens[pos];
    return t !== undefined && "op" in t && t.op === op;
  };
  const primary = (): number | null => {
    const t = tokens[pos];
    if (!t) return null;
    if ("num" in t) {
      pos++;
      return t.num;
    }
    if ("ref" in t) {
      pos++;
      return toNumber(valueAt(t.ref));
    }
    if (isOp("(")) {
      pos++;
      const inner = sum();
      if (inner === null || !isOp(")")) return null;
      pos++;
      return inner;
    }
    return null;
  };
  const unary = (): number | null => {
    if (isOp("-")) {
      pos++;
      const v = unary();
      return v === null ? null : -v;
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return primary();
  };
  const product = (): number | null => {
    let left = unary();
    while (left !== null && (isOp("*") || isOp("/"))) {
      const times = isOp("*");
      pos++;
      const right = unary();
      if (right === null || (!times && right === 0)) return null;
      left = times ? left * right : left / right;
    }
    return left;
  };
  const sum = (): number | null => {
    let left = product();
    while (left !== null && (isOp("+") || isOp("-"))) {
      const plus = isOp("+");
      pos++;
      const right = product();
      if (right === null) return null;
      left = plus ? left + right : left - right;
    }
    return left;
  };

  const result = sum();
  return result === null || pos !== tokens.length ? undefined : result;
}
