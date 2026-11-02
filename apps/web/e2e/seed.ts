import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DATA_DIR } from '../playwright.config';

// better-sqlite3 gehört zur API; dieselbe Installation öffnet die Datenbank des Testservers (WAL erlaubt das parallel)
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const Database = require('better-sqlite3');

export interface SeedMember {
  id: string;
  goalDays: number | null;
  doneDays: number;
  met: boolean | null;
}

/** Legt eine abgerechnete Woche samt Schuld an, wie sie der Wochenabschluss erzeugen würde. */
export function seedSettledWeek(opts: {
  teamId: string;
  weekStart: string;
  members: SeedMember[];
  debt?: { debtorId: string; creditorId: string; betText: string; redeemed?: boolean };
}) {
  const db = new Database(join(DATA_DIR, 'double-sweat.db'));
  db.pragma('busy_timeout = 5000');
  try {
    const now = Date.now();
    for (const m of opts.members) {
      db.prepare(
        'INSERT INTO week_results (user_id, team_id, week_start, tz, goal_days, done_days, met, settled_at) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        m.id,
        opts.teamId,
        opts.weekStart,
        'Europe/Berlin',
        m.goalDays,
        m.doneDays,
        m.met === null ? null : m.met ? 1 : 0,
        now,
      );
    }
    if (opts.debt) {
      db.prepare(
        'INSERT INTO debts (id, team_id, week_start, debtor_id, creditor_id, bet_text, created_at, redeemed_at) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        `seed-${opts.weekStart}-${opts.debt.debtorId.slice(-6)}`,
        opts.teamId,
        opts.weekStart,
        opts.debt.debtorId,
        opts.debt.creditorId,
        opts.debt.betText,
        now,
        opts.debt.redeemed ? now : null,
      );
    }
  } finally {
    db.close();
  }
}

/** Schiebt den Zeitpunkt, an dem das Team vollständig wurde, um `weeks` Wochen zurück: die erste volle Woche läuft schon. */
export function backdateTeam(teamId: string, weeks: number) {
  const db = new Database(join(DATA_DIR, 'double-sweat.db'));
  db.pragma('busy_timeout = 5000');
  try {
    db.prepare('UPDATE teams SET full_since = full_since - ? WHERE id = ?').run(
      weeks * 7 * 24 * 3600 * 1000,
      teamId,
    );
  } finally {
    db.close();
  }
}
