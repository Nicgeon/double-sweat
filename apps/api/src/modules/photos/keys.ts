import { eq } from 'drizzle-orm';
import type { DbLike } from '../../db/client.js';
import { checkins } from '../../db/schema.js';

/** Dateischlüssel aller Fotos eines Nutzers bzw. Teams. Vor dem Löschen der Zeilen einsammeln. */
export function photoKeysFor(db: DbLike, scope: { userId: string } | { teamId: string }): string[] {
  const rows = db
    .select({ photoKey: checkins.photoKey, thumbKey: checkins.thumbKey })
    .from(checkins)
    .where(
      'userId' in scope ? eq(checkins.userId, scope.userId) : eq(checkins.teamId, scope.teamId),
    )
    .all();
  return rows.flatMap((r) => [r.photoKey, r.thumbKey]);
}
