import type { BoardSnapshot, PageSnapshot } from "./types";
import { getDb, scheduleFlush, flushNow } from "./sqlite";

export { flushNow };

/**
 * SQLite-backed board storage with automatic localStorage mirror.
 * Every helper degrades silently when storage is unavailable so the app keeps working.
 */
const LEGACY_PREFIX = "atlas-whiteboard:";
const MIGRATED_KEY = "atlas-whiteboard:migrated-sqlite";
const LOCAL_BACKUP_KEY = "atlas-whiteboard:snapshot-v2:";

function saveLocalBackup(board: BoardSnapshot): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`${LOCAL_BACKUP_KEY}${board.id}`, JSON.stringify(board));
    }
  } catch {
    /* ignore storage errors */
  }
}

function loadLocalBackup(id: string): BoardSnapshot | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`${LOCAL_BACKUP_KEY}${id}`);
      if (raw) return JSON.parse(raw) as BoardSnapshot;
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

function pagesOf(board: BoardSnapshot): PageSnapshot[] {
  if (board.pages?.length) return board.pages;
  // legacy v1 single-page board
  return [
    {
      id: board.activePageId || "page-1",
      name: "Page 1",
      elements: board.elements ?? [],
      order: board.order ?? [],
      layers: board.layers ?? [],
      viewport: board.viewport ?? { x: 0, y: 0, zoom: 1 },
      background: { grid: "dots" },
      size: { w: 1600, h: 900 },
    },
  ];
}

async function migrateLegacy(): Promise<void> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (window.localStorage.getItem(MIGRATED_KEY)) return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(LEGACY_PREFIX) && k !== MIGRATED_KEY && !k.startsWith(LOCAL_BACKUP_KEY)) keys.push(k);
    }
    for (const k of keys) {
      try {
        const raw = window.localStorage.getItem(k);
        if (raw) await saveBoard(JSON.parse(raw) as BoardSnapshot);
      } catch {
        /* skip corrupt entry */
      }
      window.localStorage.removeItem(k);
    }
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

let ready: Promise<void> | null = null;
function init(): Promise<void> {
  if (!ready) ready = migrateLegacy();
  return ready;
}

export async function saveBoard(board: BoardSnapshot): Promise<void> {
  saveLocalBackup(board);
  const db = await getDb();
  if (!db) return;
  const pages = pagesOf(board);
  try {
    db.run("BEGIN");
    db.run(
      "INSERT INTO boards (id, name, active_page_id, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, active_page_id=excluded.active_page_id, updated_at=excluded.updated_at",
      [board.id, board.name, board.activePageId, board.updatedAt],
    );
    db.run("DELETE FROM pages WHERE board_id = ?", [board.id]);
    pages.forEach((p, i) => {
      db.run(
        "INSERT INTO pages (board_id, page_id, idx, name, size, background, viewport, layers, ordering, elements) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          board.id,
          p.id,
          i,
          p.name,
          p.size ? JSON.stringify(p.size) : null,
          JSON.stringify(p.background),
          JSON.stringify(p.viewport),
          JSON.stringify(p.layers),
          JSON.stringify(p.order),
          JSON.stringify(p.elements),
        ],
      );
    });
    db.run("COMMIT");
    scheduleFlush();
  } catch {
    try {
      db.run("ROLLBACK");
    } catch {
      /* ignore */
    }
  }
}

function rowsToBoard(
  board: { id: string; name: string; active_page_id: string; updated_at: number },
  rows: Record<string, unknown>[],
): BoardSnapshot {
  const pages: PageSnapshot[] = rows.map((r) => ({
    id: String(r["page_id"]),
    name: String(r["name"]),
    elements: JSON.parse(String(r["elements"])),
    order: JSON.parse(String(r["ordering"])),
    layers: JSON.parse(String(r["layers"])),
    viewport: JSON.parse(String(r["viewport"])),
    background: JSON.parse(String(r["background"])),
    size: r["size"] ? JSON.parse(String(r["size"])) : null,
  }));
  return {
    id: board.id,
    name: board.name,
    activePageId: board.active_page_id,
    updatedAt: board.updated_at,
    pages,
  };
}

function all(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sql: string,
  params: unknown[] = [],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

export async function loadBoard(id: string): Promise<BoardSnapshot | null> {
  await init();
  const localBackup = loadLocalBackup(id);
  const db = await getDb();
  if (!db) return localBackup;
  try {
    const boards = all(db, "SELECT * FROM boards WHERE id = ?", [id]);
    const b = boards[0];
    if (!b) return localBackup;
    const pages = all(db, "SELECT * FROM pages WHERE board_id = ? ORDER BY idx", [id]);
    const snapFromDb = rowsToBoard(
      {
        id: String(b["id"]),
        name: String(b["name"]),
        active_page_id: String(b["active_page_id"]),
        updated_at: Number(b["updated_at"]),
      },
      pages,
    );
    if (!localBackup) return snapFromDb;
    return (localBackup.updatedAt ?? 0) > (snapFromDb.updatedAt ?? 0) ? localBackup : snapFromDb;
  } catch {
    return localBackup;
  }
}

export async function listBoards(): Promise<BoardSnapshot[]> {
  await init();
  const db = await getDb();
  if (!db) return [];
  try {
    const boards = all(db, "SELECT * FROM boards ORDER BY updated_at DESC");
    return boards.map((b) => {
      const id = String(b["id"]);
      const pages = all(db, "SELECT * FROM pages WHERE board_id = ? ORDER BY idx", [id]);
      return rowsToBoard(
        {
          id,
          name: String(b["name"]),
          active_page_id: String(b["active_page_id"]),
          updated_at: Number(b["updated_at"]),
        },
        pages,
      );
    });
  } catch {
    return [];
  }
}

export async function deleteBoard(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    db.run("DELETE FROM pages WHERE board_id = ?", [id]);
    db.run("DELETE FROM boards WHERE id = ?", [id]);
    scheduleFlush();
  } catch {
    /* ignore */
  }
}
