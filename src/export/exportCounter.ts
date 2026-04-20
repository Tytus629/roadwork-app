// src/export/exportCounter.ts

import { counterRepo } from "../repositories/counterRepo";
import { toCsv } from "./csv";
import { shareCsvFile } from "./shareCsv";

export async function exportCounterCsv(args: { orgId: string }) {
  const rowsDb = await counterRepo.list({ orgId: args.orgId, limit: 300 });

  const headers = ["createdAt", "label", "count", "notes"];

  const rows = rowsDb.map((r) => [
    r.createdAt,
    r.label,
    r.count,
    r.notes ?? "",
  ]);

  const csv = toCsv(headers, rows);
  await shareCsvFile({ filename: `counters_${args.orgId}.csv`, csv });
}
