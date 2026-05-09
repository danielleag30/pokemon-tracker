import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'collection.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export let db: DatabaseSync;

export function initDatabase(): void {
  db = new DatabaseSync(DB_PATH);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS collection (
      card_id TEXT NOT NULL,
      collection_id TEXT NOT NULL DEFAULT 'default',
      quantity INTEGER NOT NULL DEFAULT 1,
      binder_tag TEXT,
      foil_type TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (card_id, collection_id)
    );

    CREATE INDEX IF NOT EXISTS idx_collection_id ON collection(collection_id);

    CREATE TABLE IF NOT EXISTS card_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS set_cards_cache (
      set_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      card_count INTEGER NOT NULL DEFAULT 0,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sets_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const cols = db.prepare("PRAGMA table_info(collection)").all() as any[];

  if (!cols.some((c) => c.name === 'collection_id')) {
    db.exec(`
      ALTER TABLE collection ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'default';
      CREATE INDEX IF NOT EXISTS idx_collection_id ON collection(collection_id);
    `);
  }

  if (!cols.some((c) => c.name === 'foil_type')) {
    db.exec(`ALTER TABLE collection ADD COLUMN foil_type TEXT;`);
  }

  console.log('Database ready:', DB_PATH);
}
