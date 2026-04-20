// src/export/exportTailgate.ts

import { tailgateRepo } from "../repositories/tailgateRepo";
import { toCsv } from "./csv";
import { shareCsvFile } from "./shareCsv";

export async function exportTailgateCsv(args: { orgId: string }) {
  const logs = await tailgateRepo.listByDateDesc({ orgId: args.orgId, limit: 60 });

  const headers = [
    "dateKey",
    "workTypes",
    "hazards",
    "ppe",
    "trafficControl",
    "supervisorName",
    "notes",
    "createdAt",
  ];

  const rows = logs.map((l) => [
    l.dateKey,
    (l.workTypes ?? []).join("; "),
    (l.hazards ?? []).join("; "),
    (l.ppe ?? []).join("; "),
    (l.trafficControl ?? []).join("; "),
    l.supervisorName ?? "",
    l.notes ?? "",
    l.createdAt,
  ]);

  const csv = toCsv(headers, rows);
  await shareCsvFile({ filename: `tailgate_${args.orgId}.csv`, csv });
}
