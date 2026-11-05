import { eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { memberships, teams, type User, users } from '../../db/schema.js';
import type { PartnerColor } from '../../domain/colors.js';
import type { Locale } from '../../i18n/locales.js';
import { badRequest, conflict } from '../../util/errors.js';
import { verifyReauth } from '../auth/service.js';
import { mergePrefs, type NotificationPrefs } from '../notifications/prefs.js';
import { photoKeysFor } from '../photos/keys.js';
import { getMembership, partnerColorOf, TEAM_SIZE } from '../teams/service.js';
import { requestTimezoneChange } from './timezone.js';

export interface ProfileUpdate {
  displayName?: string | undefined;
  timezone?: string | undefined;
  reminderTime?: string | undefined;
  color?: PartnerColor | undefined;
  locale?: Locale | undefined;
  notifications?: Partial<NotificationPrefs> | undefined;
}

export function updateProfile(ctx: AppContext, user: User, update: ProfileUpdate): User {
  const set: Partial<Pick<User, 'displayName' | 'reminderTime' | 'locale' | 'notifyPrefs'>> = {};
  if (update.displayName !== undefined) set.displayName = update.displayName.trim();
  if (update.reminderTime !== undefined) set.reminderTime = update.reminderTime;
  if (update.locale !== undefined) set.locale = update.locale;
  if (update.notifications !== undefined && Object.keys(update.notifications).length > 0)
    set.notifyPrefs = mergePrefs(user.notifyPrefs, update.notifications);
  if (
    Object.keys(set).length === 0 &&
    update.timezone === undefined &&
    update.color === undefined
  ) {
    throw badRequest('empty_update', 'Keine Änderungen angegeben');
  }
  if (update.color !== undefined) changeColor(ctx, user.id, update.color);
  if (Object.keys(set).length > 0) ctx.db.update(users).set(set).where(eq(users.id, user.id)).run();
  if (update.timezone !== undefined) requestTimezoneChange(ctx, user, update.timezone);
  return ctx.db.select().from(users).where(eq(users.id, user.id)).get()!;
}

/** Ändert die Identitätsfarbe. Im Team darf sie nicht die der anderen Person sein (Prüfung und Änderung atomar). */
function changeColor(ctx: AppContext, userId: string, color: PartnerColor): void {
  ctx.db.transaction(
    (tx) => {
      const membership = getMembership(tx, userId);
      if (membership && partnerColorOf(tx, membership.teamId, userId) === color)
        throw conflict('color_taken', 'Diese Farbe hat dein Partner schon gewählt');
      tx.update(users).set({ color }).where(eq(users.id, userId)).run();
    },
    { behavior: 'immediate' },
  );
}

/**
 * Löscht das Konto samt eigener Daten (Cascade). Das Team bleibt für den Partner bestehen und wird
 * unvollständig; war man allein im Team, verschwindet auch das Team.
 */
export async function deleteAccount(ctx: AppContext, user: User, password: string): Promise<void> {
  await verifyReauth(ctx, user, password);
  const keys = ctx.db.transaction(
    (tx) => {
      const photoKeys = photoKeysFor(tx, { userId: user.id });
      const membership = getMembership(tx, user.id);
      tx.delete(users).where(eq(users.id, user.id)).run();
      if (!membership) return photoKeys;
      const remaining = tx
        .select()
        .from(memberships)
        .where(eq(memberships.teamId, membership.teamId))
        .all();
      if (remaining.length === 0) tx.delete(teams).where(eq(teams.id, membership.teamId)).run();
      else if (remaining.length < TEAM_SIZE)
        tx.update(teams).set({ fullSince: null }).where(eq(teams.id, membership.teamId)).run();
      return photoKeys;
    },
    { behavior: 'immediate' },
  );
  await ctx.photos.remove(keys);
}
