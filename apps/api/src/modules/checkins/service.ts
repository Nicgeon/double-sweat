import { and, count, countDistinct, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import type { User } from '../../db/schema.js';
import { type Checkin, checkins, memberships, users } from '../../db/schema.js';
import { isWeekClosed, type LocalDate, localDateAt, weekStartOf } from '../../domain/weeks.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { goalForWeek } from '../goals/service.js';
import { currentTimezone } from '../me/timezone.js';
import { checkinFileKeys } from '../photos/keys.js';
import { processPhoto } from '../photos/pipeline.js';
import { type ReactionDto, reactionsFor } from '../reactions/service.js';
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
  /** Reaktionen des Partners (höchstens eine, eigene Check-ins kann man nicht bewerten). */
  reactions: ReactionDto[];
  photo: { thumbUrl: string; fullUrl: string; width: number; height: number };
  /** Optionales Selfie (Frontkamera) zum selben Check-in. */
  selfie: { thumbUrl: string; fullUrl: string; width: number; height: number } | null;
}

export function toCheckinDto(
  row: Checkin,
  displayName: string,
  reactions: ReactionDto[] = [],
): CheckinDto {
  return {
    id: row.id,
    userId: row.userId,
    displayName,
    localDate: row.localDate,
    weekStart: row.weekStart,
    tag: row.tag,
    note: row.note,
    createdAt: row.createdAt,
    reactions,
    photo: {
      thumbUrl: `/api/v1/photos/${row.id}/thumb`,
      fullUrl: `/api/v1/photos/${row.id}/full`,
      width: row.width,
      height: row.height,
    },
    selfie:
      row.selfieKey && row.selfieWidth !== null && row.selfieHeight !== null
        ? {
            thumbUrl: `/api/v1/photos/${row.id}/selfie-thumb`,
            fullUrl: `/api/v1/photos/${row.id}/selfie-full`,
            width: row.selfieWidth,
            height: row.selfieHeight,
          }
        : null,
  };
}

/** Höchstzahl der Check-ins pro Tag: mehrere Workouts sind erlaubt, aber nicht beliebig viele. */
export const MAX_CHECKINS_PER_DAY = 5;

export function countCheckinsOn(db: DbLike, userId: string, localDate: LocalDate): number {
  return (
    db
      .select({ n: count() })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), eq(checkins.localDate, localDate)))
      .get()?.n ?? 0
  );
}

export interface CheckinInput {
  photo: Buffer;
  /** Optional: Selfie der Frontkamera. Wird wie das Foto geprüft und neu kodiert. */
  selfie?: Buffer | undefined;
  note?: string | undefined;
  tag?: CheckinTag | undefined;
}

/**
 * Legt einen Check-in für den heutigen Tag an. Der Tag ergibt sich allein aus Serverzeit und Zeitzone des
 * Nutzers. Pro Tag sind bis zu MAX_CHECKINS_PER_DAY Check-ins möglich; für das Wochenziel zählt der Tag nur einmal.
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
  const dayFull = () =>
    conflict('daily_limit', `Du hast heute schon ${MAX_CHECKINS_PER_DAY} Check-ins gemacht`);
  // Günstige Vorabprüfung, bevor das Bild verarbeitet wird
  if (countCheckinsOn(ctx.db, user.id, localDate) >= MAX_CHECKINS_PER_DAY) throw dayFull();

  const photo = await processPhoto(input.photo);
  // Das Selfie ist freiwillig; ist es unbrauchbar, scheitert der Upload mit der Meldung zum Bild (kein stilles Weglassen)
  const selfie = input.selfie ? await processPhoto(input.selfie) : null;
  const id = newId(now);
  const folder = `${membership.teamId}/${localDate.slice(0, 7)}`;
  const photoKey = `${folder}/${id}.jpg`;
  const thumbKey = `${folder}/${id}.thumb.jpg`;
  const selfieKey = selfie ? `${folder}/${id}.selfie.jpg` : null;
  const selfieThumbKey = selfie ? `${folder}/${id}.selfie.thumb.jpg` : null;
  const written = [
    photoKey,
    thumbKey,
    ...(selfieKey && selfieThumbKey ? [selfieKey, selfieThumbKey] : []),
  ];
  try {
    await ctx.photos.write(photoKey, photo.full);
    await ctx.photos.write(thumbKey, photo.thumb);
    if (selfie && selfieKey && selfieThumbKey) {
      await ctx.photos.write(selfieKey, selfie.full);
      await ctx.photos.write(selfieThumbKey, selfie.thumb);
    }
  } catch (error) {
    await ctx.photos.remove(written);
    throw error;
  }

  try {
    const { row, firstOfDay } = ctx.db.transaction(
      (tx) => {
        const already = countCheckinsOn(tx, user.id, localDate);
        if (already >= MAX_CHECKINS_PER_DAY) throw dayFull();
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
          bytes: photo.full.length + (selfie?.full.length ?? 0),
          selfieKey,
          selfieThumbKey,
          selfieWidth: selfie?.width ?? null,
          selfieHeight: selfie?.height ?? null,
          note,
          tag: input.tag ?? null,
          createdAt: now,
        };
        tx.insert(checkins).values(values).run();
        return { row: values, firstOfDay: already === 0 };
      },
      { behavior: 'immediate' },
    );
    // Nur der erste Check-in des Tages meldet sich beim Partner (weitere am selben Tag wären Rauschen)
    if (firstOfDay) notifyPartnerOfCheckin(ctx, user, membership.teamId, row.id, weekStart);
    return toCheckinDto(row, user.displayName);
  } catch (error) {
    await ctx.photos.remove(written);
    throw error;
  }
}

/**
 * Sagt dem Partner Bescheid: "Ben hat eingecheckt." Ist es der Check-in, der das Wochenziel erfüllt, kommt stattdessen
 * "Ben hat das Wochenziel erreicht." (nie beides). Der Text bleibt neutral: weder Trainingsart noch Notiz.
 */
function notifyPartnerOfCheckin(
  ctx: AppContext,
  user: User,
  teamId: string,
  checkinId: string,
  weekStart: LocalDate,
): void {
  const partner = ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.teamId, teamId), ne(memberships.userId, user.id)))
    .get();
  if (!partner) return;
  const goal = goalForWeek(ctx.db, user.id, weekStart);
  const days =
    ctx.db
      .select({ n: countDistinct(checkins.localDate) })
      .from(checkins)
      .where(and(eq(checkins.userId, user.id), eq(checkins.weekStart, weekStart)))
      .get()?.n ?? 0;
  const data = { checkinId, weekStart };
  if (goal !== null && days === goal) {
    ctx.push.notify(partner.userId, {
      type: 'goal_reached',
      params: { name: user.displayName, goal },
      data,
    });
  } else {
    ctx.push.notify(partner.userId, {
      type: 'checkin',
      params: { name: user.displayName },
      data,
    });
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
  const reacted = reactionsFor(
    db,
    rows.map((r) => r.checkin.id),
  );
  return rows.map((r) => toCheckinDto(r.checkin, r.displayName, reacted.get(r.checkin.id) ?? []));
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
  await ctx.photos.remove(checkinFileKeys(row));
}

export const PHOTO_VARIANTS = ['thumb', 'full', 'selfie-thumb', 'selfie-full'] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

/** Foto für ein Teammitglied öffnen. Fremde Teams und unbekannte IDs liefern beide "nicht gefunden". */
export async function openPhoto(
  ctx: AppContext,
  user: User,
  checkinId: string,
  variant: PhotoVariant,
) {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw notFound();
  const row = ctx.db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, checkinId), eq(checkins.teamId, membership.teamId)))
    .get();
  if (!row) throw notFound();
  const key = {
    thumb: row.thumbKey,
    full: row.photoKey,
    'selfie-thumb': row.selfieThumbKey,
    'selfie-full': row.selfieKey,
  }[variant];
  if (!key) throw notFound();
  try {
    return await ctx.photos.open(key);
  } catch {
    throw notFound();
  }
}
