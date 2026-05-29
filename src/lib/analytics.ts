/** Utilities for inferring column types and aggregating dataset records. */
export type RecordRow = Record<string, string | number | null>;

export type ColumnKind = "number" | "date" | "string";

export function inferColumnKind(values: Array<string | number | null | undefined>): ColumnKind {
  let numeric = 0;
  let date = 0;
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    total++;
    if (typeof v === "number" && !Number.isNaN(v)) numeric++;
    else if (typeof v === "string") {
      const n = Number(v.replace(/[,$%]/g, ""));
      if (!Number.isNaN(n) && v.trim() !== "") numeric++;
      else if (!Number.isNaN(Date.parse(v))) date++;
    }
  }
  if (total === 0) return "string";
  if (numeric / total > 0.7) return "number";
  if (date / total > 0.7) return "date";
  return "string";
}

export function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,$%\s]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

export function profileColumns(records: RecordRow[]): Record<string, ColumnKind> {
  if (records.length === 0) return {};
  const keys = Object.keys(records[0]);
  const out: Record<string, ColumnKind> = {};
  for (const k of keys) {
    out[k] = inferColumnKind(records.map((r) => r[k]));
  }
  return out;
}

/** Group sum: returns [{label, value}] sorted by value desc. */
export function groupSum(records: RecordRow[], groupKey: string, valueKey: string, limit = 10) {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = String(r[groupKey] ?? "—");
    map.set(k, (map.get(k) ?? 0) + toNumber(r[valueKey]));
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Time-series: group records by date column (day) and sum value. */
export function timeSeries(records: RecordRow[], dateKey: string, valueKey: string) {
  const map = new Map<string, number>();
  for (const r of records) {
    const raw = r[dateKey];
    if (!raw) continue;
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + toNumber(r[valueKey]));
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

export function sum(records: RecordRow[], key: string) {
  return records.reduce((acc, r) => acc + toNumber(r[key]), 0);
}

export function uniqueCount(records: RecordRow[], key: string) {
  return new Set(records.map((r) => String(r[key] ?? ""))).size;
}

export function filterByDateRange(records: RecordRow[], dateKey: string | null, from?: Date, to?: Date) {
  if (!dateKey || (!from && !to)) return records;
  return records.filter((r) => {
    const raw = r[dateKey];
    if (!raw) return false;
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function formatNumber(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}
