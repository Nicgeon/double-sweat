import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

  it('Migration 0009: der bisherige Einsatz pro Team gilt danach bei beiden Personen', () => {
    const folder = join(__dirname, '..', 'drizzle');
    const files = readdirSync(folder)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .sort();
    const run = (db: Database.Database, file: string) => {
      for (const statement of readFileSync(join(folder, file), 'utf8').split(
        '--> statement-breakpoint',
      )) {
        if (statement.trim()) db.exec(statement);
      }
    };
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const file of files.filter((f) => f < '0009')) run(db, file);
    db.exec(`
      INSERT INTO teams (id, name, created_at) VALUES ('t1', 'Team', 1);
      INSERT INTO users (id, email, password_hash, password_changed_at, display_name, timezone, created_at)
        VALUES ('u1', 'a@example.org', 'x', 1, 'Anna', 'Europe/Berlin', 1),
               ('u2', 'b@example.org', 'x', 1, 'Ben', 'Europe/Berlin', 1);
      INSERT INTO memberships (team_id, user_id, slot, joined_at) VALUES ('t1', 'u1', 1, 1), ('t1', 'u2', 2, 1);
      INSERT INTO bets (id, team_id, text, effective_from, created_by, created_at)
        VALUES ('b1', 't1', 'Kaffee', '2026-03-09', 'u1', 5), ('b2', 't1', 'Kino', '2026-03-16', 'u2', 6);
    `);
    run(db, '0009_bets_per_person.sql');
    const rows = db
      .prepare(
        'SELECT user_id AS u, text, effective_from AS f FROM bets ORDER BY user_id, effective_from',
      )
      .all();
    expect(rows).toEqual([
      { u: 'u1', text: 'Kaffee', f: '2026-03-09' },
      { u: 'u1', text: 'Kino', f: '2026-03-16' },
      { u: 'u2', text: 'Kaffee', f: '2026-03-09' },
      { u: 'u2', text: 'Kino', f: '2026-03-16' },
    ]);
    // Pro Person und Montag genau ein Einsatz
    expect(() =>
      db
        .prepare(
          "INSERT INTO bets (id, team_id, user_id, text, effective_from, created_at) VALUES ('x','t1','u1','Doppelt','2026-03-09',1)",
        )
        .run(),
    ).toThrow();
    // Löscht man ein Konto, verschwinden dessen Einsätze mit
    db.prepare("DELETE FROM memberships WHERE user_id = 'u2'").run();
    db.prepare("DELETE FROM users WHERE id = 'u2'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM bets').get()).toEqual({ n: 2 });
  });
});
