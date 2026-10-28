import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { backupDatabase, openDatabase } from '../src/db/client.js';
import { memberships, teams, users } from '../src/db/schema.js';

const dir = () => mkdtempSync(join(tmpdir(), 'ds-db-'));

describe('Datenbank', () => {
  it('nutzt WAL, Fremdschlüssel und nur für den Besitzer lesbare Dateien', () => {
    const path = join(dir(), 'sub', 'ds.db');
    const db = openDatabase(path);
    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
  });

  it('auch die WAL- und SHM-Dateien sind nur für den Besitzer lesbar', () => {
    const path = join(dir(), 'ds.db');
    const db = openDatabase(path);
    db.$client.prepare('CREATE TABLE IF NOT EXISTS probe (x)').run();
    db.$client.prepare('INSERT INTO probe VALUES (1)').run();
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).mode & 0o777, file).toBe(0o600);
    }
  });

  it('wendet Migrationen idempotent an', () => {
    const path = join(dir(), 'ds.db');
    openDatabase(path).$client.close();
    const again = openDatabase(path);
    const tables = again.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'users',
        'teams',
        'memberships',
        'invites',
        'sessions',
        'app_tokens',
        'email_tokens',
        'rate_limits',
      ]),
    );
  });

  it('erzwingt höchstens zwei Teammitglieder und gültige Plätze auf DB-Ebene', () => {
    const db = openDatabase(':memory:');
    const now = Date.now();
    const user = (id: string) => ({
      id,
      email: `${id}@x.org`,
      passwordHash: 'h',
      passwordChangedAt: now,
      displayName: id,
      timezone: 'UTC',
      createdAt: now,
    });
    for (const id of ['a', 'b', 'c']) db.insert(users).values(user(id)).run();
    db.insert(teams).values({ id: 't', name: 'T', createdAt: now }).run();
    db.insert(memberships).values({ teamId: 't', userId: 'a', slot: 1, joinedAt: now }).run();
    db.insert(memberships).values({ teamId: 't', userId: 'b', slot: 2, joinedAt: now }).run();
    expect(() =>
      db.insert(memberships).values({ teamId: 't', userId: 'c', slot: 1, joinedAt: now }).run(),
    ).toThrow();
    expect(() =>
      db.insert(memberships).values({ teamId: 't', userId: 'c', slot: 3, joinedAt: now }).run(),
    ).toThrow();
  });

  it('löscht abhängige Daten per Cascade (Konto, Team)', () => {
    const db = openDatabase(':memory:');
    const now = Date.now();
    db.insert(users)
      .values({
        id: 'a',
        email: 'a@x.org',
        passwordHash: 'h',
        passwordChangedAt: now,
        displayName: 'A',
        timezone: 'UTC',
        createdAt: now,
      })
      .run();
    db.insert(teams).values({ id: 't', name: 'T', createdAt: now }).run();
    db.insert(memberships).values({ teamId: 't', userId: 'a', slot: 1, joinedAt: now }).run();
    db.delete(teams).run();
    expect(db.select().from(memberships).all()).toHaveLength(0);
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  it('erstellt ein lesbares Backup mit Rechten 0600', () => {
    const base = dir();
    const db = openDatabase(join(base, 'ds.db'));
    const now = Date.now();
    db.insert(users)
      .values({
        id: 'a',
        email: 'a@x.org',
        passwordHash: 'h',
        passwordChangedAt: now,
        displayName: 'A',
        timezone: 'UTC',
        createdAt: now,
      })
      .run();
    const target = join(base, 'backup.db');
    backupDatabase(db, target);
    expect(existsSync(target)).toBe(true);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    const copy = new Database(target, { readonly: true });
    expect(copy.prepare('SELECT email FROM users').get()).toEqual({ email: 'a@x.org' });
  });
});
