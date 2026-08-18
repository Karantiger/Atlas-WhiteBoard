/**
 * Browser-side SQLite (sql.js / WebAssembly).
 *
 * The whole board database lives in a single SQLite file that is persisted to
 * OPFS when available and to IndexedDB otherwise. Everything here is
 * client-only and degrades to an in-memory database when storage is blocked.
 */
import type { Database, SqlJsStatic } from "sql.js";

/** Served from public/ so the binary never enters the server bundle. */
const WASM_URL = "/wasm/sql-wasm.wasm";

const DB_FILE = "atlas-whiteboard.sqlite";
const IDB_NAME = "atlas-whiteboard-sqlite";
const IDB_STORE = "files";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_page_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  board_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  name TEXT NOT NULL,
  size TEXT,
  background TEXT NOT NULL,
  viewport TEXT NOT NULL,
  layers TEXT NOT NULL,
  ordering TEXT NOT NULL,
  elements TEXT NOT NULL,
  PRIMARY KEY (board_id, page_id)
);
CREATE INDEX IF NOT EXISTS pages_board ON pages(board_id, idx);
`;

/* ---------------------------------------------------------------- */
/* File persistence (OPFS with an IndexedDB fallback)                 */
/* ---------------------------------------------------------------- */
function opfsRoot(): Promise<FileSystemDirectoryHandle> | null {
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (!nav?.storage?.getDirectory) return null;
  return nav.storage.getDirectory();
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readFile(): Promise<Uint8Array | null> {
  try {
    const root = await opfsRoot();
    if (root) {
      const handle = await root.getFileHandle(DB_FILE, { create: false }).catch(() => null);
      if (!handle) return null;
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    }
  } catch {
    /* fall through to IndexedDB */
  }
  try {
    const db = await idb();
    return await new Promise<Uint8Array | null>((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(DB_FILE);
      req.onsuccess = () => {
        const val = req.result as ArrayBuffer | Uint8Array | undefined;
        resolve(val ? new Uint8Array(val instanceof Uint8Array ? val : new Uint8Array(val)) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeFile(bytes: Uint8Array): Promise<void> {
  try {
    const root = await opfsRoot();
    if (root) {
      const handle = await root.getFileHandle(DB_FILE, { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes as unknown as BufferSource);
      await writable.close();
      return;
    }
  } catch {
    /* fall through to IndexedDB */
  }
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(bytes, DB_FILE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* storage unavailable — stay in memory */
  }
}

/* ---------------------------------------------------------------- */
/* Database singleton                                                 */
/* ---------------------------------------------------------------- */
let dbPromise: Promise<Database | null> | null = null;

async function create(): Promise<Database | null> {
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("sql.js");
    const initSqlJs = (mod.default ?? mod) as unknown as (cfg?: {
      locateFile?: (f: string) => string;
    }) => Promise<SqlJsStatic>;
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    const bytes = await readFile();
    const db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
    db.run(SCHEMA);
    return db;
  } catch {
    return null;
  }
}

export function getDb(): Promise<Database | null> {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}

/* Serialized, debounced flush of the database file. */
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> = Promise.resolve();

export function scheduleFlush(delay = 400) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushing = flushing.then(async () => {
      const db = await getDb();
      if (!db) return;
      try {
        await writeFile(db.export());
      } catch {
        /* ignore quota / storage errors */
      }
    });
  }, delay);
}

export function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushing = flushing.then(async () => {
    const db = await getDb();
    if (!db) return;
    try {
      await writeFile(db.export());
    } catch {
      /* ignore */
    }
  });
  return flushing;
}
