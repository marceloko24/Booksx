import type {
  DateValue,
  Database,
  Filter,
  FilterOp,
  ID,
  Page,
  Property,
  PropertyType,
  PropValue,
  SelectOption,
  View,
  Workspace,
} from "./types";
import { getRows } from "./store";
import { todayISO } from "./utils";

// ---------------------------------------------------------------------------
// computed values
// ---------------------------------------------------------------------------

export function rawValue(row: Page, prop: Property): PropValue {
  if (prop.type === "title") return row.title;
  if (prop.type === "created_time") return new Date(row.createdAt).toISOString().slice(0, 10);
  return row.props?.[prop.id];
}

/** Value with rollups/formulas evaluated. */
export function computeValue(ws: Workspace, row: Page, prop: Property, db: Database): PropValue {
  if (prop.type === "rollup") return computeRollup(ws, row, prop, db);
  if (prop.type === "formula") return evalFormula(ws, row, prop.expression ?? "", db);
  return rawValue(row, prop);
}

function computeRollup(ws: Workspace, row: Page, prop: Property, db: Database): PropValue {
  const rel = db.properties.find((p) => p.id === prop.relationPropId);
  if (!rel || rel.type !== "relation" || !rel.targetDbId) return null;
  const ids = (row.props?.[rel.id] as string[] | undefined) ?? [];
  const related = ids.map((id) => ws.pages[id]).filter((p): p is Page => !!p && !p.trashed);
  const targetDb = ws.pages[rel.targetDbId]?.database;
  const target = targetDb?.properties.find((p) => p.id === prop.targetPropId) ??
    targetDb?.properties.find((p) => p.type === "title");
  const fn = prop.rollupFn ?? "count";
  if (fn === "count") return related.length;
  if (!target || !targetDb) return null;
  const values = related.map((r) => computeValue(ws, r, target, targetDb));
  const nonEmpty = values.filter((v) => !isEmpty(v));
  switch (fn) {
    case "count_values":
      return nonEmpty.length;
    case "sum":
    case "avg":
    case "min":
    case "max": {
      const nums = nonEmpty.map(Number).filter((n) => !Number.isNaN(n));
      if (!nums.length) return null;
      if (fn === "sum") return round(nums.reduce((a, b) => a + b, 0));
      if (fn === "avg") return round(nums.reduce((a, b) => a + b, 0) / nums.length);
      if (fn === "min") return Math.min(...nums);
      return Math.max(...nums);
    }
    case "percent_checked": {
      if (!related.length) return null;
      return round(values.filter((v) => v === true).length / related.length);
    }
    case "percent_done": {
      if (!related.length) return null;
      const done = values.filter((v) => {
        const opt = target.options?.find((o) => o.id === v);
        return opt?.group === "done";
      }).length;
      return round(done / related.length);
    }
    case "show":
      return nonEmpty.map((v) => displayText(ws, v, target)).join(", ");
  }
  return null;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// tiny safe formula language
//   numbers, "strings", true/false, prop("Name"), + - * / %, comparisons,
//   && || !, parentheses, and functions: if, concat, length, round, abs,
//   min, max, now, today, dateBetween, empty, upper, lower, format
// ---------------------------------------------------------------------------

type Tok = { t: "num" | "str" | "id" | "op" | "(" | ")" | ","; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) { s += src[j]; j++; }
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%><!".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "(" || c === ")" || c === ",") { out.push({ t: c, v: c }); i++; continue; }
    throw new Error(`Carácter inesperado: ${c}`);
  }
  return out;
}

type Val = number | string | boolean | null;

export function evalFormula(ws: Workspace, row: Page, expr: string, db: Database): PropValue {
  if (!expr.trim()) return null;
  try {
    const toks = tokenize(expr);
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    const expect = (t: Tok["t"]) => {
      const k = next();
      if (!k || k.t !== t) throw new Error("Sintaxis inválida");
      return k;
    };
    const propVal = (name: string): Val => {
      const p = db.properties.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!p || p.type === "formula") return null;
      const v = computeValue(ws, row, p, db);
      if (v === undefined || v === null) return null;
      if (typeof v === "object" && !Array.isArray(v)) return (v as DateValue).start;
      if (Array.isArray(v)) return v.map((x) => displayText(ws, x, p)).join(", ");
      if (p.type === "select" || p.type === "status") return p.options?.find((o) => o.id === v)?.name ?? "";
      return v as Val;
    };
    const call = (fn: string, args: Val[]): Val => {
      switch (fn) {
        case "if": return args[0] ? args[1] ?? null : args[2] ?? null;
        case "concat": return args.map((a) => (a === null ? "" : String(a))).join("");
        case "length": return String(args[0] ?? "").length;
        case "round": {
          const d = Number(args[1] ?? 0);
          const f = 10 ** d;
          return Math.round(Number(args[0]) * f) / f;
        }
        case "abs": return Math.abs(Number(args[0]));
        case "min": return Math.min(...args.map(Number));
        case "max": return Math.max(...args.map(Number));
        case "today": case "now": return todayISO();
        case "empty": return args[0] === null || args[0] === "" ;
        case "upper": return String(args[0] ?? "").toUpperCase();
        case "lower": return String(args[0] ?? "").toLowerCase();
        case "format": return String(args[0] ?? "");
        case "dateBetween": {
          const a = Date.parse(String(args[0]));
          const b = Date.parse(String(args[1]));
          if (Number.isNaN(a) || Number.isNaN(b)) return null;
          return Math.round((a - b) / 86400000);
        }
      }
      throw new Error(`Función desconocida: ${fn}`);
    };
    const primary = (): Val => {
      const t = next();
      if (!t) throw new Error("Expresión incompleta");
      if (t.t === "num") return Number(t.v);
      if (t.t === "str") return t.v;
      if (t.t === "(") { const v = orExpr(); expect(")"); return v; }
      if (t.t === "op" && t.v === "-") return -Number(primary());
      if (t.t === "op" && t.v === "!") return !primary();
      if (t.t === "id") {
        if (t.v === "true") return true;
        if (t.v === "false") return false;
        expect("(");
        const args: Val[] = [];
        if (peek()?.t !== ")") {
          args.push(orExpr());
          while (peek()?.t === ",") { next(); args.push(orExpr()); }
        }
        expect(")");
        if (t.v === "prop") return propVal(String(args[0]));
        return call(t.v, args);
      }
      throw new Error("Sintaxis inválida");
    };
    const binary = (sub: () => Val, ops: string[], apply: (op: string, a: Val, b: Val) => Val) => () => {
      let left = sub();
      while (peek()?.t === "op" && ops.includes(peek()!.v)) {
        const op = next().v;
        left = apply(op, left, sub());
      }
      return left;
    };
    const mul = binary(primary, ["*", "/", "%"], (op, a, b) =>
      op === "*" ? Number(a) * Number(b) : op === "/" ? Number(a) / Number(b) : Number(a) % Number(b));
    const add = binary(mul, ["+", "-"], (op, a, b) =>
      op === "+" ? (typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : Number(a) + Number(b)) : Number(a) - Number(b));
    const cmp = binary(add, [">", "<", ">=", "<=", "==", "!="], (op, a, b) => {
      switch (op) {
        case ">": return (a as number) > (b as number);
        case "<": return (a as number) < (b as number);
        case ">=": return (a as number) >= (b as number);
        case "<=": return (a as number) <= (b as number);
        case "==": return a == b; // eslint-disable-line eqeqeq
        default: return a != b; // eslint-disable-line eqeqeq
      }
    });
    const andExpr = binary(cmp, ["&&"], (_o, a, b) => Boolean(a) && Boolean(b));
    const orExpr: () => Val = binary(andExpr, ["||"], (_o, a, b) => Boolean(a) || Boolean(b));
    const result = orExpr();
    if (pos < toks.length) throw new Error("Sintaxis inválida");
    if (typeof result === "number" && !Number.isFinite(result)) return null;
    return typeof result === "number" ? round(result) : result;
  } catch (e) {
    return `⚠ ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// display
// ---------------------------------------------------------------------------

export function isEmpty(v: PropValue): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function findOption(prop: Property, id: unknown): SelectOption | undefined {
  return prop.options?.find((o) => o.id === id);
}

export function displayText(ws: Workspace, v: PropValue, prop: Property): string {
  if (isEmpty(v)) return "";
  switch (prop.type) {
    case "select":
    case "status":
      return findOption(prop, v)?.name ?? "";
    case "multi_select":
      return (v as string[]).map((id) => findOption(prop, id)?.name).filter(Boolean).join(", ");
    case "relation":
      return (v as string[]).map((id) => ws.pages[id]?.title || "Sin título").join(", ");
    case "checkbox":
      return v ? "Sí" : "No";
    case "date": {
      const d = v as DateValue;
      return d.end ? `${d.start} → ${d.end}` : d.start;
    }
    case "number":
      return formatNumber(Number(v), prop);
    case "rollup":
      if (typeof v === "number" && (prop.rollupFn === "percent_checked" || prop.rollupFn === "percent_done"))
        return `${Math.round(v * 100)}%`;
      return String(v);
    default:
      return String(v);
  }
}

export function formatNumber(n: number, prop?: Property): string {
  if (Number.isNaN(n)) return "";
  if (prop?.numberFormat === "percent") return `${n}%`;
  if (prop?.numberFormat === "currency")
    return n.toLocaleString("es", { style: "currency", currency: "USD" });
  return n.toLocaleString("es");
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

export const OPS_BY_TYPE: Record<PropertyType, FilterOp[]> = {
  title: ["contains", "not_contains", "is", "is_not", "starts_with", "is_empty", "is_not_empty"],
  text: ["contains", "not_contains", "is", "is_not", "starts_with", "is_empty", "is_not_empty"],
  url: ["contains", "not_contains", "is", "is_empty", "is_not_empty"],
  email: ["contains", "not_contains", "is", "is_empty", "is_not_empty"],
  person: ["contains", "not_contains", "is", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty"],
  select: ["is", "is_not", "is_empty", "is_not_empty"],
  status: ["is", "is_not", "is_empty", "is_not_empty"],
  multi_select: ["contains", "not_contains", "is_empty", "is_not_empty"],
  date: ["is", "before", "after", "on_or_before", "on_or_after", "is_today", "is_overdue", "is_empty", "is_not_empty"],
  created_time: ["is", "before", "after", "on_or_before", "on_or_after", "is_today"],
  checkbox: ["is_checked", "is_unchecked"],
  relation: ["contains", "not_contains", "is_empty", "is_not_empty"],
  rollup: ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "is_empty", "is_not_empty"],
  formula: ["contains", "is", "eq", "gt", "lt", "is_empty", "is_not_empty"],
};

export const OP_LABEL: Record<FilterOp, string> = {
  contains: "contiene",
  not_contains: "no contiene",
  is: "es",
  is_not: "no es",
  starts_with: "empieza por",
  is_empty: "está vacío",
  is_not_empty: "no está vacío",
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  before: "antes de",
  after: "después de",
  on_or_before: "en o antes de",
  on_or_after: "en o después de",
  is_today: "es hoy",
  is_overdue: "está vencida",
  is_checked: "marcada",
  is_unchecked: "sin marcar",
};

export const OPS_WITHOUT_VALUE: FilterOp[] = ["is_empty", "is_not_empty", "is_today", "is_overdue", "is_checked", "is_unchecked"];

function matchFilter(ws: Workspace, row: Page, f: Filter, db: Database): boolean {
  const prop = db.properties.find((p) => p.id === f.propId);
  if (!prop) return true;
  const v = computeValue(ws, row, prop, db);
  const fv = (f.value ?? "").toLowerCase();
  if (f.op === "is_empty") return isEmpty(v);
  if (f.op === "is_not_empty") return !isEmpty(v);
  if (f.op === "is_checked") return v === true;
  if (f.op === "is_unchecked") return v !== true;
  if (!OPS_WITHOUT_VALUE.includes(f.op) && f.value === undefined) return true;

  switch (prop.type) {
    case "number":
    case "rollup":
    case "formula": {
      if (typeof v === "number" || (!isNaN(Number(v)) && v !== "" && v !== null && v !== undefined)) {
        const a = Number(v);
        const b = Number(f.value);
        switch (f.op) {
          case "eq": return a === b;
          case "neq": return a !== b;
          case "gt": return a > b;
          case "lt": return a < b;
          case "gte": return a >= b;
          case "lte": return a <= b;
        }
      }
      return textMatch(displayText(ws, v, prop).toLowerCase(), f.op, fv);
    }
    case "select":
    case "status": {
      if (f.op === "is") return v === f.value;
      if (f.op === "is_not") return v !== f.value;
      return true;
    }
    case "multi_select":
    case "relation": {
      const arr = (v as string[] | undefined) ?? [];
      if (f.op === "contains") return arr.includes(f.value!);
      if (f.op === "not_contains") return !arr.includes(f.value!);
      return true;
    }
    case "date":
    case "created_time": {
      const d = typeof v === "string" ? v : (v as DateValue | undefined)?.start;
      if (f.op === "is_today") return d === todayISO();
      if (f.op === "is_overdue") return !!d && d < todayISO();
      if (!d) return false;
      const target = f.value!;
      switch (f.op) {
        case "is": return d === target;
        case "before": return d < target;
        case "after": return d > target;
        case "on_or_before": return d <= target;
        case "on_or_after": return d >= target;
      }
      return true;
    }
    default:
      return textMatch(String(v ?? "").toLowerCase(), f.op, fv);
  }
}

function textMatch(s: string, op: FilterOp, fv: string) {
  switch (op) {
    case "contains": return s.includes(fv);
    case "not_contains": return !s.includes(fv);
    case "is": return s === fv;
    case "is_not": return s !== fv;
    case "starts_with": return s.startsWith(fv);
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// sort + group
// ---------------------------------------------------------------------------

function sortKey(ws: Workspace, row: Page, prop: Property, db: Database): string | number {
  const v = computeValue(ws, row, prop, db);
  if (isEmpty(v)) return "";
  switch (prop.type) {
    case "number":
    case "rollup":
      return Number(v);
    case "checkbox":
      return v ? 1 : 0;
    case "select":
    case "status":
      return prop.options?.findIndex((o) => o.id === v) ?? 0;
    case "date":
      return (v as DateValue).start;
    default:
      return displayText(ws, v, prop).toLowerCase();
  }
}

export interface QueryResult {
  rows: Page[];
  groups: { key: string; label: string; color?: string; option?: SelectOption; rows: Page[] }[] | null;
}

export function queryView(ws: Workspace, dbId: ID, view: View, search = ""): QueryResult {
  const db = ws.pages[dbId]?.database;
  if (!db) return { rows: [], groups: null };
  let rows = getRows(ws, dbId);

  if (view.filters.length) {
    rows = rows.filter((r) => {
      const results = view.filters.map((f) => matchFilter(ws, r, f, db));
      return view.filterMode === "or" ? results.some(Boolean) : results.every(Boolean);
    });
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    rows = rows.filter((r) => (r.title || "").toLowerCase().includes(q));
  }
  if (view.sorts.length) {
    const sorts = view.sorts
      .map((s) => ({ s, prop: db.properties.find((p) => p.id === s.propId) }))
      .filter((x): x is { s: (typeof view.sorts)[number]; prop: Property } => !!x.prop);
    rows = rows.slice().sort((a, b) => {
      for (const { s, prop } of sorts) {
        const ka = sortKey(ws, a, prop, db);
        const kb = sortKey(ws, b, prop, db);
        if (ka === kb) continue;
        // empty values last
        if (ka === "") return 1;
        if (kb === "") return -1;
        const r = ka < kb ? -1 : 1;
        return s.dir === "asc" ? r : -r;
      }
      return 0;
    });
  }

  const groupProp = view.groupBy ? db.properties.find((p) => p.id === view.groupBy) : undefined;
  if (!groupProp) return { rows, groups: null };
  return { rows, groups: groupRows(ws, rows, groupProp, db) };
}

export function groupRows(ws: Workspace, rows: Page[], prop: Property, db: Database): NonNullable<QueryResult["groups"]> {
  if (prop.type === "select" || prop.type === "status" || prop.type === "multi_select") {
    const groups = (prop.options ?? []).map((o) => ({
      key: o.id,
      label: o.name,
      option: o,
      rows: [] as Page[],
    }));
    const none = { key: "__none", label: `Sin ${prop.name.toLowerCase()}`, option: undefined, rows: [] as Page[] };
    for (const r of rows) {
      const v = computeValue(ws, r, prop, db);
      const ids = Array.isArray(v) ? v : v ? [v as string] : [];
      let placed = false;
      for (const id of ids) {
        const g = groups.find((x) => x.key === id);
        if (g) { g.rows.push(r); placed = true; }
      }
      if (!placed) none.rows.push(r);
    }
    return [none, ...groups];
  }
  if (prop.type === "checkbox") {
    const yes = { key: "true", label: "Marcado", rows: [] as Page[] };
    const no = { key: "false", label: "Sin marcar", rows: [] as Page[] };
    for (const r of rows) (computeValue(ws, r, prop, db) === true ? yes : no).rows.push(r);
    return [no, yes];
  }
  // generic: group by display text
  const map = new Map<string, Page[]>();
  for (const r of rows) {
    const label = displayText(ws, computeValue(ws, r, prop, db), prop) || "(vacío)";
    map.set(label, [...(map.get(label) ?? []), r]);
  }
  return [...map.entries()].map(([label, rs]) => ({ key: label, label, rows: rs }));
}

/** value to set on a row when it is dropped/created inside a group */
export function valueForGroup(prop: Property, key: string): PropValue {
  if (prop.type === "checkbox") return key === "true";
  if (key === "__none") return prop.type === "multi_select" ? [] : null;
  if (prop.type === "multi_select") return [key];
  if (prop.type === "select" || prop.type === "status") return key;
  if (key === "(vacío)") return null;
  return key;
}

export function propIcon(type: PropertyType): string {
  const icons: Record<PropertyType, string> = {
    title: "Aa",
    text: "≡",
    number: "#",
    select: "◉",
    multi_select: "☰",
    status: "◐",
    date: "📅",
    person: "👤",
    checkbox: "☑",
    url: "🔗",
    email: "@",
    relation: "↗",
    rollup: "Σ",
    formula: "ƒ",
    created_time: "🕒",
  };
  return icons[type];
}

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  title: "Título",
  text: "Texto",
  number: "Número",
  select: "Selección",
  multi_select: "Selección múltiple",
  status: "Estado",
  date: "Fecha",
  person: "Persona",
  checkbox: "Casilla",
  url: "URL",
  email: "Correo",
  relation: "Relación",
  rollup: "Rollup",
  formula: "Fórmula",
  created_time: "Fecha de creación",
};
