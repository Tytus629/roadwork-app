export const SYSTEM_NOTES = {
  workOrderSync: {
    summary: "Work order sync is fully functional for both Point and Line geometry.",
    keyFixes: [
      "Line geometry must be valid GeoJSON: [lng, lat] coordinate arrays.",
      "Mobile now sanitizes line points before enqueue.",
      "Mobile sends BOTH legacy geo format and GeoJSON geometry for compatibility.",
      "Backend normalizes and stores geometry in Firestore-safe object format.",
      "Outbox retry issues resolved by ensuring correct payload shape at send time."
    ],
    criticalFiles: [
      "src/sync/enqueueWorkOrderUpsert.ts",
      "src/sync/outboxSync.ts",
      "src/services/devFunctionsHttp.ts",
      "functions/src/roadwork_upsertWorkOrder.ts"
    ],
    diagnostics: [
      "[OutboxDiag][line-sanitized]",
      "[OutboxDiag][geo-final]",
      "[OutboxDiag][send-initial]",
      "[OutboxDiag][wire-request]"
    ]
  },

  knownBehavior: {
    outbox: [
      "Old rows created before geometry fix may fail or retry until cleared.",
      "Newly created rows after fix should succeed immediately."
    ],
    geometry: [
      "Line geometry requires at least 2 valid points.",
      "Coordinates must be numeric and finite.",
      "GeoJSON uses [lng, lat], NOT {lat, lng}."
    ]
  }
};
