// Applies to: MOBILE APP
// File: src/db/migrations/002_offline_workorders.ts
//
// Offline-first tables: org-scoped work orders, geometry, photos, audit log, outbox queue.
// Registered as migration id=4 in ../migrations.ts (ids 1-3 already taken).

import type { Migration } from "../migrations";

export const MIGRATION_OFFLINE_WORKORDERS: Migration = {
  id: 4,
  name: "offline_workorders_v1",
  sql: [
    // ── Offline Work Orders ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS offline_work_orders (
      id TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      note TEXT,
      geometryType TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      createdByUid TEXT NOT NULL,
      createdByEmail TEXT,
      createdByFirstName TEXT,
      createdByLastName TEXT,
      createdByDisplayName TEXT,
      assignedToUid TEXT,
      assignedToName TEXT,
      assignedToEmail TEXT,
      needsSync INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0
    );`,

    `CREATE INDEX IF NOT EXISTS idx_offline_wo_org_status ON offline_work_orders(orgId, status);`,
    `CREATE INDEX IF NOT EXISTS idx_offline_wo_org_updated ON offline_work_orders(orgId, updatedAt);`,

    // ── Geometry (JSON): point {lat,lng} or line [{lat,lng},...] ─────────
    `CREATE TABLE IF NOT EXISTS offline_work_order_geometry (
      workOrderId TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      geoJson TEXT NOT NULL,
      FOREIGN KEY(workOrderId) REFERENCES offline_work_orders(id) ON DELETE CASCADE
    );`,

    // ── Photos metadata (files live in app storage) ─────────────────────
    `CREATE TABLE IF NOT EXISTS offline_work_order_photos (
      id TEXT PRIMARY KEY NOT NULL,
      workOrderId TEXT NOT NULL,
      orgId TEXT NOT NULL,
      entityType TEXT,
      entityId TEXT,
      localUri TEXT NOT NULL,
      storagePath TEXT,
      width INTEGER,
      height INTEGER,
      createdAt INTEGER NOT NULL,
      needsSync INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(workOrderId) REFERENCES offline_work_orders(id) ON DELETE CASCADE
    );`,

    `CREATE INDEX IF NOT EXISTS idx_offline_photos_wo ON offline_work_order_photos(workOrderId);`,

    // ── Audit log (local) ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      action TEXT NOT NULL,
      payloadJson TEXT,
      createdAt INTEGER NOT NULL,
      createdByUid TEXT NOT NULL,
      needsSync INTEGER NOT NULL DEFAULT 1
    );`,

    `CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_log(orgId, createdAt);`,

    // ── Outbox queue (deterministic, idempotent sync) ───────────────────
    `CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      kind TEXT NOT NULL,
      entityId TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );`,

    `CREATE INDEX IF NOT EXISTS idx_outbox_org_time ON outbox(orgId, createdAt);`,
  ],
};
