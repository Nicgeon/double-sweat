import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import type { User } from '../../db/schema.js';
import { type Checkin, checkins, users } from '../../db/schema.js';
import { isWeekClosed, type LocalDate, localDateAt, weekStartOf } from '../../domain/weeks.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { currentTimezone } from '../me/timezone.js';
import { processPhoto } from '../photos/pipeline.js';
import { getMembership } from '../teams/service.js';

export const CHECKIN_TAGS = [
  'kraft',
  'cardio',
  'laufen',
  'rad',
  'schwimmen',
  'yoga',
  'sonstiges',
] as const;
export type CheckinTag = (typeof CHECKIN_TAGS)[number];
export const NOTE_MAX_LENGTH = 280;

export interface CheckinDto {
  id: string;
  userId: string;
  displayName: string;
  localDate: LocalDate;
  weekStart: LocalDate;
  tag: string | null;
  note: string | null;
  createdAt: number;
  photo: { thumbUrl: string; fullUrl: string; width: number; height: number };
}

export function toCheckinDto(row: Checkin, displayName: string): CheckinDto {
  return {
    id: row.id,
    userId: row.userId,
    displayName,
    localDate: row.localDate,
    weekStart: row.weekStart,
    tag: row.tag,
    note: row.note,
    createdAt: row.createdAt,
    photo: {
      thumbUrl: `/api/v1/photos/${row.id}/thumb`,
      fullUrl: `/api/v1/photos/${row.id}/full`,
      width: row.width,
      height: row.height,
    },
  };
}

export function hasCheckinOn(db: DbLike, userId: string, localDate: LocalDate): boolean {
  return !!db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.userId, userId), eq(checkins.localDate, localDate)))
    .get();
}

export interface CheckinInput {
  photo: Buffer;
  note?: string | undefined;
  tag?: CheckinTag | undefined;
}

/**
 * Legt den Check-in des heutigen Tages an. Der Tag ergibt sich allein aus Serverzeit und Zeitzone des
 * Nutzers. Pro Tag zählt höchstens ein Check-in (zusätzlich per UNIQUE-Constraint abgesichert).
 */
export async function createCheckin(
  ctx: AppContext,
  user: User,
  input: CheckinInput,
): Promise<CheckinDto> {
  const limit = ctx.limiter.hit(`checkin:user:${user.id}`, 30, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Für Check-ins brauchst du ein Team');

  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX_LENGTH)
    throw badRequest('note_too_long', 'Die Notiz ist zu lang');

  const now = ctx.clock.now();
  const zone = currentTimezone(ctx, user);
  const localDate = localDateAt(now, zone);
  const weekStart = weekStartOf(localDate);
  const alreadyDone = () => conflict('already_checked_in', 'Du hast heute schon eingecheckt');
  // Günstige Vorabprüfung, bevor das Bild verarbeitet wird
  if (hasCheckinOn(ctx.db, user.id, localDate)) throw alreadyDone();

  const photo = await processPhoto(input.photo);
  const id = newId(now);
  const folder = `${membership.teamId}/${localDate.slice(0, 7)}`;
  const photoKey = `${folder}/${id}.jpg`;
  const thumbKey = `${folder}/${id}.thumb.jpg`;
  await ctx.photos.write(photoKey, photo.full);
  await ctx.photos.write(thumbKey, photo.thumb);

  try {
    const row = ctx.db.transaction(
      (tx) => {
        if (hasCheckinOn(tx, user.id, localDate)) throw alreadyDone();
        const duplicate = tx
          .select({ id: checkins.id })
          .from(checkins)
          .where(
            and(eq(checkins.teamId, membership.teamId), eq(checkins.photoSha256, photo.sha256)),
          )
          .get();
        if (duplicate) throw conflict('duplicate_photo', 'Dieses Foto wurde bereits verwendet');
        const values = {
          id,
          userId: user.id,
          teamId: membership.teamId,
          localDate,
          weekStart,
          tz: zone,
          photoKey,
          thumbKey,
          photoSha256: photo.sha256,
          width: photo.width,
          height: photo.height,
          bytes: photo.full.length,
          note,
          tag: input.tag ?? null,
          createdAt: now,
        };
        tx.insert(checkins).values(values).run();
        return values;
      },
      { behavior: 'immediate' },
    );
    return toCheckinDto(row, user.displayName);
  } catch (error) {
    await ctx.photos.remove([photoKey, thumbKey]);
    throw error;
  }
}

export function listWeekCheckins(ctx: AppContext, user: User, weekStart: LocalDate): CheckinDto[] {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  return listTeamCheckins(ctx.db, membership.teamId, [weekStart]);
}

export function listTeamCheckins(
  db: DbLike,
  teamId: string,
  weekStarts: LocalDate[],
): CheckinDto[] {
  const rows = db
    .select({ checkin: checkins, displayName: users.displayName })
    .from(checkins)
    .innerJoin(users, eq(users.id, checkins.userId))
    .where(and(eq(checkins.teamId, teamId), inArray(checkins.weekStart, weekStarts)))
    .orderBy(desc(checkins.createdAt))
    .all();
  return rows.map((r) => toCheckinDto(r.checkin, r.displayName));
}

/** Eigenen Check-in zurücknehmen, solange seine Woche noch läuft. */
export async function deleteCheckin(ctx: AppContext, user: User, id: string): Promise<void> {
  const row = ctx.db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, id), eq(checkins.userId, user.id)))
    .get();
  if (!row) throw notFound('Check-in nicht gefunden');
  if (isWeekClosed(row.weekStart, row.tz, ctx.clock.now())) {
    throw conflict(
      'week_closed',
      'Die Woche ist abgeschlossen, der Check-in kann nicht mehr geändert werden',
    );
  }
  ctx.db.delete(checkins).where(eq(checkins.id, id)).run();
  await ctx.photos.remove([row.photoKey, row.thumbKey]);
}

/** Foto für ein Teammitglied öffnen. Fremde Teams und unbekannte IDs liefern beide "nicht gefunden". */
export async function openPhoto(
  ctx: AppContext,
  user: User,
  checkinId: string,
  variant: 'thumb' | 'full',
) {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw notFound();
  const row = ctx.db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, checkinId), eq(checkins.teamId, membership.teamId)))
    .get();
  if (!row) throw notFound();
  try {
    return await ctx.photos.open(variant === 'thumb' ? row.thumbKey : row.photoKey);
  } catch {
    throw notFound();
  }
}
