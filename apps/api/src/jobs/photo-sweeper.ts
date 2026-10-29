import type { AppContext } from '../context.js';
import { checkins } from '../db/schema.js';
import { checkinFileKeys } from '../modules/photos/keys.js';
import { HOUR } from '../util/time.js';

const SWEEP_INTERVAL_MS = HOUR;
/** Frische Dateien werden nie angefasst: Ein Upload schreibt die Datei vor der Datenbankzeile. */
const GRACE_MS = HOUR;

/**
 * Entfernt Fotodateien ohne Datenbankzeile (z. B. nach einem Absturz mitten im Upload).
 * Läuft höchstens einmal pro Stunde, auch wenn der Scheduler minütlich tickt.
 */
export function createPhotoSweeper() {
  let last = Number.NEGATIVE_INFINITY;
  return async function sweepPhotoOrphans(ctx: AppContext): Promise<void> {
    const now = ctx.clock.now();
    if (now - last < SWEEP_INTERVAL_MS) return;
    last = now;
    const rows = ctx.db
      .select({
        photoKey: checkins.photoKey,
        thumbKey: checkins.thumbKey,
        selfieKey: checkins.selfieKey,
        selfieThumbKey: checkins.selfieThumbKey,
      })
      .from(checkins)
      .all();
    const known = new Set(rows.flatMap(checkinFileKeys));
    const removed = await ctx.photos.sweepOrphans(known, now, GRACE_MS);
    if (removed > 0) ctx.log.info('orphan_photos_removed', { count: removed });
  };
}
