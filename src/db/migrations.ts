/**
 * migrations.ts — SQLite Schema Migrations
 *
 * MIGRATION SYSTEM:
 * - Each migration has a numeric id and array of SQL statements.
 * - runMigrations() checks the current dbVersion from the meta table
 *   and runs any pending migrations in order.
 * - Migration state is tracked in meta.dbVersion (single row, last completed id).
 *
 * IDEMPOTENT COLUMN ADDITIONS (at bottom of runMigrations):
 * Some columns (like orgId, inspectionLastSavedAt) use addColumnIfMissing()
 * which runs on every app start. This is a safety net — if the migration
 * ran but the column somehow doesn't exist (corruption, partial migration),
 * it gets re-added. No-op if the column already exists.
 *
 * ─── orgId AND COMPOSITE INDEXES ──────────────────────────────────────
 *
 * Migration 5 adds orgId to work_orders for multi-org isolation.
 * The actual ALTER TABLE runs via addColumnIfMissing() for idempotency.
 *
 * Two composite indexes are created after migrations run:
 *   - idx_work_orders_orgId_createdAt: Used by listActiveWorkOrders,
 *     listWorkOrders, and any query sorted by creation time within an org.
 *   - idx_work_orders_orgId_bbox: Used by listWorkOrdersInBBox (MapScreen)
 *     and listSignsNear for spatial queries scoped to an org.
 *
 * These are composite because queries always filter by orgId AND another
 * dimension (time or geography). A single-column orgId index would require
 * a second index scan; composite indexes serve both conditions in one pass.
 */
import { db, addColumnIfMissing, ensureWorkOrdersOrgIdColumn } from "./db";
import { MIGRATION_OFFLINE_WORKORDERS } from "./migrations/002_offline_workorders";
import { migrateWorkOrdersV2 } from "./migrate_workorders_v2";

export type Migration = {
  id: number;
  name: string;
  sql: string[];
};

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init_core_tables",
    sql: [
      `
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,              -- "Sign", "Pothole", etc
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,

        status TEXT NOT NULL,            -- "Needs" | "In Progress" | "Done"
        priority TEXT NOT NULL,          -- "Low" | "Medium" | "High" | "Urgent"
        note TEXT,

        geomType TEXT NOT NULL,          -- "point" | "line"
        lat REAL,                        -- point only
        lng REAL,                        -- point only
        lineJson TEXT,                   -- line only (array of {lat,lng})

        -- bbox for fast map querying (both point & line)
        minLat REAL NOT NULL,
        minLng REAL NOT NULL,
        maxLat REAL NOT NULL,
        maxLng REAL NOT NULL
      );
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_work_orders_bbox
      ON work_orders(minLat, minLng, maxLat, maxLng);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_work_orders_type
      ON work_orders(type);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_work_orders_status_priority
      ON work_orders(status, priority);
      `,

      `
      CREATE TABLE IF NOT EXISTS sign_details (
        workOrderId TEXT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
        signTypeId TEXT,
        category TEXT,
        condition TEXT,              -- "Good" | "Faded" | "Damaged" | "Missing"
        action TEXT,                 -- "Replace" | "Repair" | "Clean" | "Install"
        reflectivityIssue INTEGER    -- 0/1
      );
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_sign_category_condition
      ON sign_details(category, condition);
      `,

      `
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        uri TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lat REAL,
        lng REAL
      );
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_photos_workorder
      ON photos(workOrderId);
      `,

      `
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        workOrderId TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        createdAt INTEGER NOT NULL,
        event TEXT NOT NULL,
        payloadJson TEXT
      );
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_logs_workorder_time
      ON logs(workOrderId, createdAt);
      `,
    ],
  },
  {
    id: 2,
    name: "add_sign_inspection_columns",
    sql: [
      // Add inspection columns to sign_details
      // These run only once when upgrading from migration 1 to 2
      `ALTER TABLE sign_details ADD COLUMN inspectionVisible INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE sign_details ADD COLUMN reflectivityScore INTEGER;`,
      `ALTER TABLE sign_details ADD COLUMN delaminationScore INTEGER;`,
      `ALTER TABLE sign_details ADD COLUMN appearanceScore INTEGER;`,
      `ALTER TABLE sign_details ADD COLUMN postMaterial TEXT;`,
      `ALTER TABLE sign_details ADD COLUMN postConditionScore INTEGER;`,
    ],
  },
  {
    id: 3,
    name: "add_sign_catalog_columns",
    sql: [
      // MUTCD Sign Catalog fields — these were in SignDetailsRow type but missing from schema
      `ALTER TABLE sign_details ADD COLUMN signCategory TEXT;`,
      `ALTER TABLE sign_details ADD COLUMN signCode TEXT;`,
      `ALTER TABLE sign_details ADD COLUMN signName TEXT;`,
    ],
  },
  MIGRATION_OFFLINE_WORKORDERS,
  {
    id: 5,
    name: "add_orgId_to_work_orders",
    sql: [
      // orgId is nullable so ALTER TABLE doesn't require a default
      // addColumnIfMissing is used in runMigrations() for idempotency,
      // but we still include the ALTER here for fresh installs that run migrations sequentially.
    ],
  },
  {
    id: 6,
    name: "orgId_not_null",
    sql: [
      // 1) New table with NOT NULL orgId
      `CREATE TABLE IF NOT EXISTS work_orders_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        note TEXT,
        geomType TEXT NOT NULL,
        lat REAL,
        lng REAL,
        lineJson TEXT,
        minLat REAL NOT NULL,
        minLng REAL NOT NULL,
        maxLat REAL NOT NULL,
        maxLng REAL NOT NULL,
        orgId TEXT NOT NULL
      );`,

      // 2) Copy only rows with a non-null orgId
      `INSERT INTO work_orders_new (
        id,type,createdAt,updatedAt,status,priority,note,geomType,lat,lng,lineJson,minLat,minLng,maxLat,maxLng,orgId
      )
      SELECT
        id,type,createdAt,updatedAt,status,priority,note,geomType,lat,lng,lineJson,minLat,minLng,maxLat,maxLng,orgId
      FROM work_orders
      WHERE orgId IS NOT NULL;`,

      // 3) Swap
      `DROP TABLE work_orders;`,
      `ALTER TABLE work_orders_new RENAME TO work_orders;`,

      // 4) Re-create all indexes on the new table
      `CREATE INDEX IF NOT EXISTS idx_work_orders_bbox
       ON work_orders(minLat, minLng, maxLat, maxLng);`,
      `CREATE INDEX IF NOT EXISTS idx_work_orders_type
       ON work_orders(type);`,
      `CREATE INDEX IF NOT EXISTS idx_work_orders_status_priority
       ON work_orders(status, priority);`,
      `CREATE INDEX IF NOT EXISTS idx_work_orders_orgId_createdAt
       ON work_orders(orgId, createdAt);`,
      `CREATE INDEX IF NOT EXISTS idx_work_orders_org_bbox
       ON work_orders(orgId, minLat, maxLat, minLng, maxLng);`,
    ],
  },
  {
    id: 7,
    name: "add_assets_asset_events_tool_records",
    sql: [
      // ── Assets table ────────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,

        assetType TEXT NOT NULL,       -- "SIGN" | "GUARDRAIL" | "CULVERT"
        subtype TEXT,                  -- e.g. "STOP", "W_BEAM", "CMP_36"
        status TEXT NOT NULL DEFAULT 'ACTIVE',  -- "ACTIVE" | "RETIRED"

        lat REAL NOT NULL,
        lng REAL NOT NULL,

        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdByUid TEXT,
        createdByDisplayName TEXT,

        installedAt INTEGER,

        lastEventAt INTEGER,
        lastInspectionAt INTEGER,

        detailsJson TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_assets_org_type ON assets(orgId, assetType);`,
      `CREATE INDEX IF NOT EXISTS idx_assets_org_lat_lng ON assets(orgId, lat, lng);`,

      // ── Asset Events table ──────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS asset_events (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        assetId TEXT NOT NULL REFERENCES assets(id),

        kind TEXT NOT NULL,            -- "INSTALL" | "INSPECTION" | "REPAIR" | "REPLACE" | "NOTE"
        at INTEGER NOT NULL,           -- event time (epoch ms)
        byUid TEXT,
        byDisplayName TEXT,

        workOrderId TEXT,
        notes TEXT,

        photoIdsJson TEXT,             -- JSON array of strings
        detailsJson TEXT,

        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_asset_events_org_asset_at
       ON asset_events(orgId, assetId, at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_asset_events_org_workOrder
       ON asset_events(orgId, workOrderId);`,

      // ── Tool Records table ──────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS tool_records (
        id TEXT PRIMARY KEY NOT NULL,
        orgId TEXT NOT NULL,
        kind TEXT NOT NULL,            -- "DMI" | "COUNTER" | "TAILGATE"
        createdAt INTEGER NOT NULL,
        createdByUid TEXT,
        deviceId TEXT,
        appVersion TEXT,
        dataJson TEXT NOT NULL         -- kind-specific payload stored as JSON
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tool_records_orgId_kind ON tool_records(orgId, kind);`,
      `CREATE INDEX IF NOT EXISTS idx_tool_records_createdAt ON tool_records(createdAt);`,
    ],
  },
  {
    id: 8,
    name: 'add_tailgate_logs',
    sql: [
      `CREATE TABLE IF NOT EXISTS tailgate_logs (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        dateKey TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdByUid TEXT,
        createdByDisplayName TEXT,
        deviceId TEXT,
        appVersion TEXT,
        crewJson TEXT,
        workTypesJson TEXT,
        hazardsJson TEXT,
        ppeJson TEXT,
        trafficControlJson TEXT,
        notes TEXT,
        signedByJson TEXT,
        supervisorName TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tailgate_org_date ON tailgate_logs(orgId, dateKey);`,
    ],
  },
  {
    id: 9,
    name: 'add_tool_dmi_counter',
    sql: [
      `CREATE TABLE IF NOT EXISTS tool_dmi (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdByUid TEXT,
        createdByDisplayName TEXT,
        deviceId TEXT,
        appVersion TEXT,
        startAt INTEGER NOT NULL,
        endAt INTEGER NOT NULL,
        startLat REAL,
        startLng REAL,
        endLat REAL,
        endLng REAL,
        inputUnit TEXT NOT NULL DEFAULT 'mi',
        startReadingRaw TEXT,
        endReadingRaw TEXT,
        startReadingMiles REAL,
        endReadingMiles REAL,
        distanceMiles REAL,
        distanceMeters REAL NOT NULL,
        notes TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tool_dmi_org_createdAt ON tool_dmi(orgId, createdAt DESC);`,
      `CREATE TABLE IF NOT EXISTS tool_counter (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdByUid TEXT,
        createdByDisplayName TEXT,
        deviceId TEXT,
        appVersion TEXT,
        label TEXT NOT NULL,
        count INTEGER NOT NULL,
        lat REAL,
        lng REAL,
        notes TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tool_counter_org_createdAt ON tool_counter(orgId, createdAt DESC);`,
    ],
  },
  {
    id: 10,
    name: 'add_notification_inbox',
    sql: [
      `CREATE TABLE IF NOT EXISTS notification_inbox (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        recipientUid TEXT,
        recipientEmail TEXT,
        category TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        sourceCreatedAt INTEGER NOT NULL,
        targetType TEXT,
        targetId TEXT,
        title TEXT NOT NULL,
        body TEXT,
        actorUid TEXT,
        actorName TEXT,
        actorEmail TEXT,
        metadataJson TEXT,
        readAt INTEGER,
        openedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_notification_inbox_org_recipient_time
       ON notification_inbox(orgId, recipientUid, readAt, sourceCreatedAt DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notification_inbox_org_email_time
       ON notification_inbox(orgId, recipientEmail, readAt, sourceCreatedAt DESC);`,
    ],
  },
  {
    id: 11,
    name: 'add_maintenance_slips',
    sql: [
      `CREATE TABLE IF NOT EXISTS maintenance_slips (
        id TEXT PRIMARY KEY,
        orgId TEXT NOT NULL,
        unitLabel TEXT NOT NULL,
        equipmentType TEXT,
        systemArea TEXT,
        issueTitle TEXT NOT NULL,
        issueDescription TEXT,
        locationHint TEXT,
        readingLabel TEXT,
        status TEXT NOT NULL,
        severity TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdByUid TEXT,
        createdByDisplayName TEXT,
        createdByEmail TEXT,
        assignedToUid TEXT,
        assignedToName TEXT,
        assignedToEmail TEXT,
        deviceId TEXT,
        appVersion TEXT,
        notesJson TEXT,
        lastStatusChangedAt INTEGER,
        lastStatusChangedByUid TEXT,
        lastStatusChangedByDisplayName TEXT,
        lastStatusChangedByEmail TEXT,
        resolvedAt INTEGER,
        resolvedByUid TEXT,
        resolvedByDisplayName TEXT,
        resolvedByEmail TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_maintenance_slips_org_updated
       ON maintenance_slips(orgId, updatedAt DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_maintenance_slips_org_status
       ON maintenance_slips(orgId, status, updatedAt DESC);`,
    ],
  },
  {
    id: 12,
    name: 'extend_maintenance_slips_vehicle_linkage',
    sql: [
      `ALTER TABLE maintenance_slips ADD COLUMN vehicleAssetId TEXT;`,
      `ALTER TABLE maintenance_slips ADD COLUMN vehicleSource TEXT;`,
      `ALTER TABLE maintenance_slips ADD COLUMN vehicleSnapshotJson TEXT;`,
      `ALTER TABLE maintenance_slips ADD COLUMN maintenanceCategory TEXT;`,
      `ALTER TABLE maintenance_slips ADD COLUMN preferredServiceDate INTEGER;`,
      `ALTER TABLE maintenance_slips ADD COLUMN serviceRequestJson TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_maintenance_slips_org_vehicle_asset
       ON maintenance_slips(orgId, vehicleAssetId, updatedAt DESC);`,
    ],
  },
];

function rowsToArray(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.item === "function" && typeof rows.length === "number") {
    const out: any[] = [];
    for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
    return out;
  }
  return [];
}

function tableExists(table: string): boolean {
  const r = db.executeSync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`,
    [table]
  );
  const rows = rowsToArray(r?.rows);
  return rows.length > 0;
}

function ensureTableWithLog(table: string, createStmt: string) {
  const existedBefore = tableExists(table);
  db.executeSync(createStmt);
  const existsNow = tableExists(table);

  if (!existedBefore && existsNow) {
    console.log(`[DB][migrate] ${table} table created`);
    return;
  }
  if (existedBefore) {
    console.log(`[DB][migrate] ${table} table already exists`);
    return;
  }

  throw new Error(`[DB][migrate] ${table} table missing after ensureTableWithLog`);
}

function ensureAssetsSchema() {
  // Idempotent safety-net for installs where dbVersion may already be ahead
  // of the migration that originally introduced assets.
  ensureTableWithLog(
    "assets",
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      assetType TEXT NOT NULL,
      subtype TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      createdByUid TEXT,
      createdByDisplayName TEXT,
      installedAt INTEGER,
      lastEventAt INTEGER,
      lastInspectionAt INTEGER,
      detailsJson TEXT
    );`
  );

  ensureTableWithLog(
    "asset_events",
    `CREATE TABLE IF NOT EXISTS asset_events (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      assetId TEXT NOT NULL REFERENCES assets(id),
      kind TEXT NOT NULL,
      at INTEGER NOT NULL,
      byUid TEXT,
      byDisplayName TEXT,
      workOrderId TEXT,
      notes TEXT,
      photoIdsJson TEXT,
      detailsJson TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );`
  );

  // Safe column backfills for older table shapes.
  addColumnIfMissing("assets", "orgId", "TEXT");
  addColumnIfMissing("assets", "assetType", "TEXT");
  addColumnIfMissing("assets", "subtype", "TEXT");
  addColumnIfMissing("assets", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing("assets", "lat", "REAL");
  addColumnIfMissing("assets", "lng", "REAL");
  addColumnIfMissing("assets", "createdAt", "INTEGER");
  addColumnIfMissing("assets", "updatedAt", "INTEGER");
  addColumnIfMissing("assets", "createdByUid", "TEXT");
  addColumnIfMissing("assets", "createdByDisplayName", "TEXT");
  addColumnIfMissing("assets", "installedAt", "INTEGER");
  addColumnIfMissing("assets", "lastEventAt", "INTEGER");
  addColumnIfMissing("assets", "lastInspectionAt", "INTEGER");
  addColumnIfMissing("assets", "detailsJson", "TEXT");

  addColumnIfMissing("asset_events", "orgId", "TEXT");
  addColumnIfMissing("asset_events", "assetId", "TEXT");
  addColumnIfMissing("asset_events", "kind", "TEXT");
  addColumnIfMissing("asset_events", "at", "INTEGER");
  addColumnIfMissing("asset_events", "byUid", "TEXT");
  addColumnIfMissing("asset_events", "byDisplayName", "TEXT");
  addColumnIfMissing("asset_events", "workOrderId", "TEXT");
  addColumnIfMissing("asset_events", "notes", "TEXT");
  addColumnIfMissing("asset_events", "photoIdsJson", "TEXT");
  addColumnIfMissing("asset_events", "detailsJson", "TEXT");
  addColumnIfMissing("asset_events", "createdAt", "INTEGER");
  addColumnIfMissing("asset_events", "updatedAt", "INTEGER");

  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_assets_org_type ON assets(orgId, assetType);`,
  );
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_assets_org_lat_lng ON assets(orgId, lat, lng);`,
  );
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_asset_events_org_asset_at ON asset_events(orgId, assetId, at DESC);`,
  );
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_asset_events_org_workOrder ON asset_events(orgId, workOrderId);`,
  );

  console.log("[DB][migrate] assets schema ensure success");
}

function ensureNotificationsSchema() {
  ensureTableWithLog(
    "notification_inbox",
    `CREATE TABLE IF NOT EXISTS notification_inbox (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      recipientUid TEXT,
      recipientEmail TEXT,
      category TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      sourceCreatedAt INTEGER NOT NULL,
      targetType TEXT,
      targetId TEXT,
      title TEXT NOT NULL,
      body TEXT,
      actorUid TEXT,
      actorName TEXT,
      actorEmail TEXT,
      metadataJson TEXT,
      readAt INTEGER,
      openedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );`
  );

  addColumnIfMissing("notification_inbox", "orgId", "TEXT");
  addColumnIfMissing("notification_inbox", "recipientUid", "TEXT");
  addColumnIfMissing("notification_inbox", "recipientEmail", "TEXT");
  addColumnIfMissing("notification_inbox", "category", "TEXT");
  addColumnIfMissing("notification_inbox", "sourceType", "TEXT");
  addColumnIfMissing("notification_inbox", "sourceId", "TEXT");
  addColumnIfMissing("notification_inbox", "sourceCreatedAt", "INTEGER");
  addColumnIfMissing("notification_inbox", "targetType", "TEXT");
  addColumnIfMissing("notification_inbox", "targetId", "TEXT");
  addColumnIfMissing("notification_inbox", "title", "TEXT");
  addColumnIfMissing("notification_inbox", "body", "TEXT");
  addColumnIfMissing("notification_inbox", "actorUid", "TEXT");
  addColumnIfMissing("notification_inbox", "actorName", "TEXT");
  addColumnIfMissing("notification_inbox", "actorEmail", "TEXT");
  addColumnIfMissing("notification_inbox", "metadataJson", "TEXT");
  addColumnIfMissing("notification_inbox", "readAt", "INTEGER");
  addColumnIfMissing("notification_inbox", "openedAt", "INTEGER");
  addColumnIfMissing("notification_inbox", "createdAt", "INTEGER");
  addColumnIfMissing("notification_inbox", "updatedAt", "INTEGER");

  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_notification_inbox_org_recipient_time
     ON notification_inbox(orgId, recipientUid, readAt, sourceCreatedAt DESC);`,
  );
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_notification_inbox_org_email_time
     ON notification_inbox(orgId, recipientEmail, readAt, sourceCreatedAt DESC);`,
  );

  console.log("[DB][migrate] notification inbox schema ensure success");
}

function getDbVersion(): number {
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
  );
  const r = db.executeSync(`SELECT value FROM meta WHERE key = 'dbVersion' LIMIT 1;`);
  const rows: any = r?.rows;
  const v = Array.isArray(rows) ? rows[0]?.value : rows?.[0]?.value;
  return v ? parseInt(String(v), 10) : 0;
}

function setDbVersion(v: number) {
  db.executeSync(
    `INSERT INTO meta(key, value) VALUES ('dbVersion', ?) 
     ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    [String(v)]
  );
}

export function runMigrations() {
  const current = getDbVersion();
  const pending = MIGRATIONS.filter((m) => m.id > current).sort(
    (a, b) => a.id - b.id
  );

  for (const m of pending) {
    // Migration 6 rewrites work_orders with orgId NOT NULL and selects orgId
    // from the old table. Ensure the column exists first for legacy states
    // where dbVersion advanced but the orgId column was never added.
    if (m.id === 6) {
      try {
        const orgIdResult = ensureWorkOrdersOrgIdColumn();
        console.log(`[DB][migrate] preflight work_orders.orgId ${orgIdResult}`);
      } catch (e) {
        console.warn("[DB][migrate] preflight failed ensuring work_orders.orgId", e);
        throw e;
      }
    }

    for (const stmt of m.sql) {
      db.executeSync(stmt);
    }
    setDbVersion(m.id);
  }

  // ── IDEMPOTENT COLUMN + INDEX ADDITIONS ──
  // These run on every app start. No-op if already present.
  // Using addColumnIfMissing instead of ALTER TABLE because ALTER TABLE
  // fails if the column already exists, and we can't guarantee which
  // migration version a user is coming from.
  addColumnIfMissing("sign_details", "inspectionLastSavedAt", "INTEGER"); // epoch ms
  try {
    const orgIdResult = ensureWorkOrdersOrgIdColumn();
    console.log(`[DB][migrate] work_orders.orgId ${orgIdResult}`);
  } catch (e) {
    console.warn("[DB][migrate] Failed ensuring work_orders.orgId", e);
  }
  addColumnIfMissing("outbox", "lastAttemptAt", "INTEGER"); // row-level backoff tracking
  addColumnIfMissing("outbox", "nextAttemptAt", "INTEGER"); // exponential backoff scheduling
  addColumnIfMissing("logs", "orgId", "TEXT"); // org-scoping for audit logs
  addColumnIfMissing("work_orders", "detailsJson", "TEXT"); // type-specific fields (guardrail parts, sign presets, etc.)
  addColumnIfMissing("offline_work_order_photos", "storagePath", "TEXT"); // org-scoped path: orgs/{orgId}/workOrders/{workOrderId}/photos/{filename}
  addColumnIfMissing("offline_work_order_photos", "entityType", "TEXT"); // e.g. workOrders/assets/signs/inspections
  addColumnIfMissing("offline_work_order_photos", "entityId", "TEXT"); // related entity id for upload linkage
  addColumnIfMissing("tool_dmi", "inputUnit", "TEXT NOT NULL DEFAULT 'mi'");
  addColumnIfMissing("tool_dmi", "startReadingRaw", "TEXT");
  addColumnIfMissing("tool_dmi", "endReadingRaw", "TEXT");
  addColumnIfMissing("tool_dmi", "startReadingMiles", "REAL");
  addColumnIfMissing("tool_dmi", "endReadingMiles", "REAL");
  addColumnIfMissing("tool_dmi", "distanceMiles", "REAL");

  // Composite indexes for orgId-scoped queries (see header docs for why composite)
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_work_orders_orgId_createdAt ON work_orders(orgId, createdAt);`
  );
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_work_orders_orgId_bbox ON work_orders(orgId, minLat, minLng, maxLat, maxLng);`
  );

  // ── Production metadata + asset linking columns (V2) ──
  migrateWorkOrdersV2();

  // ── Idempotent assets + asset_events table/column/index safety-net ──
  // This runs on every startup to protect against schema drift and older
  // builds that may have advanced dbVersion without creating assets tables.
  try {
    ensureAssetsSchema();
  } catch (e) {
    console.warn("[DB][migrate] assets schema ensure failed", e);
    throw e;
  }

  try {
    ensureNotificationsSchema();
  } catch (e) {
    console.warn("[DB][migrate] notification inbox schema ensure failed", e);
    throw e;
  }
}

let dbSchemaReady = false;

/**
 * Synchronous runtime guard for callers that may run before app-level init.
 */
export function ensureDbSchemaReady(context: string = "runtime") {
  if (dbSchemaReady) return;
  try {
    runMigrations();
    dbSchemaReady = true;
    console.log(`[DB][init] schema ready (${context})`);
  } catch (e) {
    console.warn(`[DB][init] schema failed (${context})`, e);
    throw e;
  }
}
