import { db } from "./db";

type Migration = {
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
];

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
    for (const stmt of m.sql) {
      db.executeSync(stmt);
    }
    setDbVersion(m.id);
  }
}
