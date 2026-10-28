import { eq, isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppContext } from '../context.js';
import { memberships, reminderLog, teams, users } from '../db/schema.js';
import { localDateAt } from '../domain/weeks.js';
import { buildMemberProgress } from '../modules/dashboard/service.js';
import { currentTimezone } from '../modules/me/timezone.js';
import { firstScoredWeek } from '../modules/settlement/service.js';
import { HOUR } from '../util/time.js';

const KIND = 'evening';
/** Nach einem Neustart wird die Erinnerung nur bis zu dieser Uhrzeit nachgeholt, nie mitten in der Nacht. */
const LATEST_LOCAL_HOUR = 22;

/** Beginn eines lokalen Zeitpunkts HH:MM an einem Kalendertag. */
function localInstant(date: string, hhmm: string, zone: string): number {
  return DateTime.fromISO(`${date}T${hhmm}`, { zone }).toMillis();
}

/**
 * Abend-Erinnerung: Zur eingestellten Uhrzeit (Standard 19:00, in der Zeitzone des Nutzers) bekommt jeder, dessen
 * Wochenziel gefährdet ist, eine Push-Nachricht. "Gefährdet" heißt: heute noch kein Check-in, und jeder verbleibende
 * Tag wird gebraucht (kein Puffer mehr). Pro Nutzer und Tag höchstens eine Erinnerung (reminder_log).
 */
export function remindersJob(ctx: AppContext): void {
  const now = ctx.clock.now();
  const fullTeams = ctx.db.select().from(teams).where(isNotNull(teams.fullSince)).all();

  for (const team of fullTeams) {
    if (team.fullSince === null) continue;
    const members = ctx.db
      .select({ user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.teamId, team.id))
      .all();

    for (const { user } of members) {
      const zone = currentTimezone(ctx, user);
      const today = localDateAt(now, zone);
      const start = localInstant(today, user.reminderTime, zone);
      const end = Math.max(localInstant(today, `${LATEST_LOCAL_HOUR}:00`, zone), start + HOUR);
      if (now < start || now > end) continue;

      const progress = buildMemberProgress(ctx, user, user.id, now);
      // Nur Wochen, die auch gewertet werden (die Beitrittswoche nicht)
      if (progress.weekStart < firstScoredWeek(team.fullSince, zone)) continue;
      if (progress.checkedInToday || progress.status !== 'at_risk') continue;

      const inserted = ctx.db
        .insert(reminderLog)
        .values({ userId: user.id, localDate: today, kind: KIND, sentAt: now })
        .onConflictDoNothing()
        .run().changes;
      if (!inserted) continue;

      const missing = progress.neededDays;
      ctx.push.notify(user.id, {
        type: 'reminder',
        title: 'Double Sweat',
        body:
          missing === 1
            ? 'Heute noch trainieren: Dir fehlt noch ein Tag für dein Wochenziel, und es bleibt kein Puffer.'
            : `Dir fehlen noch ${missing} Tage für dein Wochenziel, und jeder verbleibende Tag zählt. Heute schon trainiert?`,
        data: { weekStart: progress.weekStart, needed: missing },
      });
    }
  }
}
