import { eq } from 'drizzle-orm';
import type { DbLike } from '../../db/client.js';
import { type Checkin, checkins } from '../../db/schema.js';

/** Alle Dateischlüssel eines Check-ins: Foto, Vorschau und, falls vorhanden, Selfie samt Vorschau. */
export function checkinFileKeys(
  row: Pick<Checkin, 'photoKey' | 'thumbKey' | 'selfieKey' | 'selfieThumbKey'>,
): string[] {
  return [row.photoKey, row.thumbKey, row.selfieKey, row.selfieThumbKey].filter(
    (key): key is string => key !== null,
  );
}

/** Dateischlüssel aller Fotos eines Nutzers bzw. Teams. Vor dem Löschen der Zeilen einsammeln. */
export function photoKeysFor(db: DbLike, scope: { userId: string } | { teamId: string }): string[] {
  const rows = db
    .select({
      photoKey: checkins.photoKey,
      thumbKey: checkins.thumbKey,
      selfieKey: checkins.selfieKey,
      selfieThumbKey: checkins.selfieThumbKey,
    })
    .from(checkins)
    .where(
      'userId' in scope ? eq(checkins.userId, scope.userId) : eq(checkins.teamId, scope.teamId),
    )
    .all();
  return rows.flatMap(checkinFileKeys);
}
