// src/export/exportDmi.ts

import { dmiRepo } from "../repositories/dmiRepo";
import { toCsv } from "./csv";
import { shareCsvFile } from "./shareCsv";

export async function exportDmiCsv(args: { orgId: string }) {
  const rowsDb = await dmiRepo.list({ orgId: args.orgId, limit: 200 });

  const headers = [
    "createdAt",
    "startAt",
    "endAt",
    "inputUnit",
    "startReadingRaw",
    "endReadingRaw",
    "startReadingMiles",
    "endReadingMiles",
    "distanceMeters",
    "distanceMiles",
    "distanceFeet",
    "notes",
  ];

  const rows = rowsDb.map((r) => [
    r.createdAt,
    r.startAt,
    r.endAt,
    r.inputUnit ?? "mi",
    r.startReadingRaw ?? "",
    r.endReadingRaw ?? "",
    r.startReadingMiles ?? "",
    r.endReadingMiles ?? "",
    r.distanceMeters,
    +(r.distanceMiles ?? r.distanceMeters / 1609.344).toFixed(3),
    +((r.distanceMiles ?? r.distanceMeters / 1609.344) * 5280).toFixed(1),
    r.notes ?? "",
  ]);

  const csv = toCsv(headers, rows);
  await shareCsvFile({ filename: `dmi_${args.orgId}.csv`, csv });
}
