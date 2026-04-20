// src/export/csv.ts
//
// Minimal CSV utilities — no external deps.

/** Escape a value for CSV (RFC 4180). */
export function csvEscape(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string from headers + rows (2-D array). */
export function toCsv(headers: string[], rows: any[][]): string {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return `${head}\n${body}\n`;
}
