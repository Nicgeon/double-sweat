import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Datenbank oder offene Transaktion. */
export type DbLike = Db | Tx;

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Öffnet die SQLite-DB (WAL, Fremdschlüssel an) und wendet ausstehende Migrationen an. */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  if (path !== ':memory:') {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* Dateisystem ohne Rechteverwaltung (z. B. bestimmte Volumes) */
    }
  }
  return db as Db;
}

/** Konsistentes Backup in eine neue Datei (VACUUM INTO), auch bei laufendem Betrieb. */
export function backupDatabase(db: Db, target: string): void {
  db.$client.prepare('VACUUM INTO ?').run(target);
  // Das Backup enthält Passwort-Hashes und Tokens-Hashes, daher nur für den Besitzer lesbar
  chmodSync(target, 0o600);
}
