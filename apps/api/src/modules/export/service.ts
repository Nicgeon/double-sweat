import { eq, or } from 'drizzle-orm';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { AppContext } from '../../context.js';
import {
  bets,
  checkins,
  debts,
  memberships,
  notifications,
  pushSubscriptions,
  teams,
  type User,
  users,
  weeklyGoals,
  weekResults,
} from '../../db/schema.js';
import { notFound, tooManyRequests } from '../../util/errors.js';
import { HOUR } from '../../util/time.js';
import { APP_NAME } from '../../version.js';
import { verifyReauth } from '../auth/service.js';
import { consumeEmailToken, createEmailToken, EMAIL_TOKEN_TTL_MS } from '../mail/tokens.js';

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportGrant {
  token: string;
  expiresAt: number;
  downloadUrl: string;
}

/**
 * Schritt 1: Nach Passwortprüfung gibt es ein Einmal-Token (60 Sekunden). Mit ihm startet der Download,
 * der auch ohne Sitzung funktioniert (Browser-Download, nativer Datei-Download der App). Ein gekaperter
 * Sitzungs-Token reicht damit nicht, um die Daten abzuziehen.
 */
export async function requestExport(
  ctx: AppContext,
  user: User,
  password: string,
): Promise<ExportGrant> {
  const limit = ctx.limiter.hit(`export:user:${user.id}`, 3, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  await verifyReauth(ctx, user, password);
  const now = ctx.clock.now();
  const token = createEmailToken(ctx.db, now, user.id, 'export');
  return {
    token,
    expiresAt: now + EMAIL_TOKEN_TTL_MS.export,
    downloadUrl: `/api/v1/me/export/${token}`,
  };
}

interface PhotoEntry {
  key: string;
  name: string;
  createdAt: number;
}

/** Sammelt die eigenen Daten. Nichts vom Partner außer dessen Anzeigename (E-Mail, Check-ins, Fotos fehlen). */
function collect(ctx: AppContext, userId: string) {
  const user = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw notFound();
  const membership = ctx.db.select().from(memberships).where(eq(memberships.userId, userId)).get();
  const team = membership
    ? ctx.db.select().from(teams).where(eq(teams.id, membership.teamId)).get()
    : undefined;
  const partnerName = (id: string) =>
    ctx.db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ?? null;

  const checkinRows = ctx.db
    .select()
    .from(checkins)
    .where(eq(checkins.userId, userId))
    .orderBy(checkins.localDate)
    .all();
  const photos: PhotoEntry[] = checkinRows.map((c) => ({
    key: c.photoKey,
    name: `photos/${c.localDate}_${c.id}.jpg`,
    createdAt: c.createdAt,
  }));

  const partnerRow = membership
    ? ctx.db
        .select({ id: memberships.userId, name: users.displayName })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.teamId, membership.teamId))
        .all()
        .find((m) => m.id !== userId)
    : undefined;

  const data = {
    app: APP_NAME,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(ctx.clock.now()).toISOString(),
    profile: {
      displayName: user.displayName,
      email: user.email,
      timezone: user.timezone,
      reminderTime: user.reminderTime,
      createdAt: new Date(user.createdAt).toISOString(),
    },
    team: team
      ? {
          name: team.name,
          partnerDisplayName: partnerRow?.name ?? null,
          joinedAt: membership ? new Date(membership.joinedAt).toISOString() : null,
        }
      : null,
    goals: ctx.db
      .select({ effectiveFrom: weeklyGoals.effectiveFrom, days: weeklyGoals.days })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.userId, userId))
      .orderBy(weeklyGoals.effectiveFrom)
      .all(),
    checkins: checkinRows.map((c, i) => ({
      id: c.id,
      localDate: c.localDate,
      weekStart: c.weekStart,
      timezone: c.tz,
      tag: c.tag,
      note: c.note,
      createdAt: new Date(c.createdAt).toISOString(),
      photo: photos[i]?.name ?? null,
    })),
    weekResults: ctx.db
      .select({
        weekStart: weekResults.weekStart,
        goalDays: weekResults.goalDays,
        doneDays: weekResults.doneDays,
        met: weekResults.met,
      })
      .from(weekResults)
      .where(eq(weekResults.userId, userId))
      .orderBy(weekResults.weekStart)
      .all(),
    bets: team
      ? ctx.db
          .select({ effectiveFrom: bets.effectiveFrom, text: bets.text })
          .from(bets)
          .where(eq(bets.teamId, team.id))
          .orderBy(bets.effectiveFrom)
          .all()
      : [],
    debts: ctx.db
      .select()
      .from(debts)
      .where(or(eq(debts.debtorId, userId), eq(debts.creditorId, userId)))
      .orderBy(debts.weekStart)
      .all()
      .map((d) => ({
        weekStart: d.weekStart,
        betText: d.betText,
        direction: d.debtorId === userId ? 'owe' : 'owed',
        otherPerson: partnerName(d.debtorId === userId ? d.creditorId : d.debtorId),
        createdAt: new Date(d.createdAt).toISOString(),
        redeemedAt: d.redeemedAt ? new Date(d.redeemedAt).toISOString() : null,
      })),
    notifications: ctx.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(notifications.createdAt)
      .all()
      .map((n) => ({
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: new Date(n.createdAt).toISOString(),
        read: n.readAt !== null,
      })),
    // Geräte ohne Endpunkte und Schlüssel: Das sind Zugangsdaten für Push, keine persönlichen Daten
    pushDevices: ctx.db
      .select({
        provider: pushSubscriptions.provider,
        deviceLabel: pushSubscriptions.deviceLabel,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all()
      .map((p) => ({ ...p, createdAt: new Date(p.createdAt).toISOString() })),
  };
  return { data, photos, user };
}

/**
 * Erzeugt das ZIP als Stream, ohne die Fotos im Speicher zu sammeln. Fotos sind schon komprimiert und werden
 * deshalb nur abgelegt (ohne erneute Kompression); die JSON-Datei wird komprimiert.
 */
function buildZip(ctx: AppContext, data: object, photos: PhotoEntry[]): ReadableStream<Uint8Array> {
  const pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else pending.push(chunk);
  });
  const drain = function* (): Generator<Uint8Array> {
    if (failure) throw failure;
    while (pending.length > 0) yield pending.shift() as Uint8Array;
  };

  async function* generate(): AsyncGenerator<Uint8Array> {
    const json = new ZipDeflate('data.json', { level: 6 });
    json.mtime = ctx.clock.now();
    zip.add(json);
    json.push(strToU8(JSON.stringify(data, null, 2)), true);
    yield* drain();

    for (const photo of photos) {
      let opened: Awaited<ReturnType<AppContext['photos']['open']>>;
      try {
        opened = await ctx.photos.open(photo.key);
      } catch {
        continue; // Datei fehlt (verwaiste Zeile): überspringen statt den ganzen Export abzubrechen
      }
      const entry = new ZipPassThrough(photo.name);
      entry.mtime = photo.createdAt;
      zip.add(entry);
      for await (const chunk of opened.stream) {
        entry.push(chunk as Uint8Array, false);
        yield* drain();
      }
      entry.push(new Uint8Array(0), true);
      yield* drain();
    }
    zip.end();
    yield* drain();
  }
  return ReadableStream.from(generate());
}

/** Schritt 2: Download. Das Token ist einmalig und nur 60 Sekunden gültig. */
export function openExport(ctx: AppContext, ip: string, token: string) {
  const limit = ctx.limiter.hit(`export-dl:ip:${ip}`, 30, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const grant = consumeEmailToken(ctx.db, ctx.clock.now(), token, ['export']);
  if (!grant) throw notFound();
  const { data, photos } = collect(ctx, grant.userId);
  const day = new Date(ctx.clock.now()).toISOString().slice(0, 10);
  return { stream: buildZip(ctx, data, photos), filename: `double-sweat-export-${day}.zip` };
}
