/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SQLITE DATABASE INITIALIZATION & STATUS TRACKING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Manages SQLite database lifecycle with graceful degradation.
 * Tracks DB initialization status for diagnostic UI banner.
 * 
 * DIAGNOSTIC SYSTEM:
 * - _dbReady: Boolean flag indicating if DB initialized successfully
 * - _dbInitError: Stores initialization error for displaying to user
 * - _dbAvailable: Fast-fail flag to prevent repeated init attempts
 * 
 * GRACEFUL DEGRADATION:
 * - If SQLite fails to initialize (rare), app continues without persistence
 * - All persistence operations catch errors and log warnings
 * - User sees "Persistence: OFF" banner with error details
 * 
 * STATUS TRACKING (Added for debugging "Work Orders disappear" issue):
 * - isDbReady(): Checked by DbBanner component in App.tsx
 * - getDbInitError(): Shows error message in banner
 * - Updated on init success/failure
 * 
 * USAGE:
 * - Call getDb() to get database instance (throws if unavailable)
 * - Call initDb() on app startup to create tables
 * - Check isDbReady() to show persistence status
 * 
 * CHANGE HISTORY:
 * - Added _dbReady and _dbInitError tracking flags
 * - Added status export functions for UI diagnostics
 * - Enhanced logging throughout initialization process
 */
import SQLite, { SQLiteDatabase } from "react-native-sqlite-storage";

SQLite.enablePromise(true);

// Singleton database instance
let _db: SQLiteDatabase | null = null;
let _initPromise: Promise<SQLiteDatabase> | null = null;

// STATUS TRACKING (for diagnostic banner)
let _dbAvailable = true;      // Fast-fail flag
let _dbInitError: any = null;  // Stores init error for display
let _dbReady = false;          // True when DB successfully initialized

/**
 * Returns whether database is available (fast-fail check)
 */
export function isDbAvailable(): boolean {
  return _dbAvailable;
}

/**
 * Returns initialization error if DB failed to start (for diagnostic UI)
 */
export function getDbInitError(): any {
  return _dbInitError;
}

/**
 * Returns whether database is ready for use (checked by DbBanner)
 */
export function isDbReady(): boolean {
  return _dbReady;
}

export async function getDb(): Promise<SQLiteDatabase> {
  // Fast-fail if we already know DB is unavailable
  if (!_dbAvailable) {
    throw new Error("Database is not available");
  }
  
  if (_db) return _db;
  
  // If initialization is in progress, wait for it
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // Check if SQLite module is available
      if (!SQLite || typeof SQLite.openDatabase !== 'function') {
        throw new Error("SQLite module not available - native module not linked");
      }
      
      console.log("[getDb] Opening database...");
      let db: SQLiteDatabase | null = null;
      
      try {
        db = await SQLite.openDatabase({
          name: "roadwork.db",
          location: "default",
        });
      } catch (openError) {
        console.warn("[getDb] SQLite.openDatabase failed:", openError);
        throw new Error("Failed to open database: " + (openError as Error).message);
      }
      
      if (!db || db === null) {
        throw new Error("SQLite.openDatabase returned null or undefined - native module may not be linked");
      }
      
      console.log("[getDb] Database opened successfully");
      _db = db;
      _dbAvailable = true;
      _dbInitError = null;
      return db;
    } catch (error) {
      _initPromise = null;
      _dbAvailable = false;
      _dbInitError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn("[getDb] Database unavailable (running without persistence):", errorMsg);
      throw error;
    }
  })();

  return _initPromise;
}

export async function initDb(): Promise<void> {
  try {
    const db = await getDb();
    console.log("[initDb] Creating tables if they don't exist...");

    // Single table for items, single table for logs.
    // Photos: store metadata only; file stays in app storage like you already do.
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        geometry_json TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT,
        note TEXT,
        sign_json TEXT,
        photos_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        needs_sync INTEGER DEFAULT 1
      );
    `);

    // STEP 1: Safe ALTER TABLE for existing databases
    try {
      await db.executeSql(`ALTER TABLE work_items ADD COLUMN needs_sync INTEGER DEFAULT 1`);
      console.log("[initDb] Added needs_sync column");
    } catch (e: any) {
      // Column already exists or other non-fatal error
      if (!e.message?.includes("duplicate column")) {
        console.warn("[initDb] Could not add needs_sync column (may already exist):", e.message);
      }
    }

    // STEP 2: Safe ALTER TABLE for completedAt timestamp
    try {
      await db.executeSql(`ALTER TABLE work_items ADD COLUMN completed_at INTEGER`);
      console.log("[initDb] Added completed_at column");
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) {
        console.warn("[initDb] Could not add completed_at column (may already exist):", e.message);
      }
    }

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS work_logs (
        id TEXT PRIMARY KEY NOT NULL,
        work_item_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        data_json TEXT,
        FOREIGN KEY(work_item_id) REFERENCES work_items(id)
      );
    `);

    // Helpful indexes for efficient queries
    await db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_work_items_updated_at
      ON work_items(updated_at);
    `);

    await db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_work_logs_work_item_id
      ON work_logs(work_item_id);
    `);

    // Sign Assets tables
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS signs (
        id TEXT PRIMARY KEY NOT NULL,
        sign_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS sign_inspections (
        id TEXT PRIMARY KEY NOT NULL,
        sign_id TEXT NOT NULL,
        inspection_json TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `);

    await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_signs_updated_at ON signs(updated_at);`);
    await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_sign_inspections_sign_id ON sign_inspections(sign_id);`);

    _dbReady = true;
    _dbInitError = null;
    console.log("[initDb] Database initialized successfully");
  } catch (error) {
    _dbReady = false;
    _dbInitError = error;
    console.warn("[initDb] Database initialization failed - running without persistence:", error);
    // Don't rethrow - allow app to continue in fallback mode
  }
}
