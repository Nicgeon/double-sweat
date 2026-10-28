import { eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { memberships, teams, type User, users } from '../../db/schema.js';
import { badRequest } from '../../util/errors.js';
import { verifyReauth } from '../auth/service.js';
import { getMembership, TEAM_SIZE } from '../teams/service.js';

export interface ProfileUpdate {
  displayName?: string | undefined;
  reminderTime?: string | undefined;
}

export function updateProfile(ctx: AppContext, user: User, update: ProfileUpdate): User {
  const set: Partial<Pick<User, 'displayName' | 'reminderTime'>> = {};
  if (update.displayName !== undefined) set.displayName = update.displayName.trim();
  if (update.reminderTime !== undefined) set.reminderTime = update.reminderTime;
  if (Object.keys(set).length === 0) throw badRequest('empty_update', 'Keine Änderungen angegeben');
  ctx.db.update(users).set(set).where(eq(users.id, user.id)).run();
  return ctx.db.select().from(users).where(eq(users.id, user.id)).get()!;
}

/**
 * Löscht das Konto samt eigener Daten (Cascade). Das Team bleibt für den Partner bestehen und wird
 * unvollständig; war man allein im Team, verschwindet auch das Team.
 */
export async function deleteAccount(ctx: AppContext, user: User, password: string): Promise<void> {
  await verifyReauth(ctx, user, password);
  ctx.db.transaction(
    (tx) => {
      const membership = getMembership(tx, user.id);
      tx.delete(users).where(eq(users.id, user.id)).run();
      if (!membership) return;
      const remaining = tx
        .select()
        .from(memberships)
        .where(eq(memberships.teamId, membership.teamId))
        .all();
      if (remaining.length === 0) tx.delete(teams).where(eq(teams.id, membership.teamId)).run();
      else if (remaining.length < TEAM_SIZE)
        tx.update(teams).set({ fullSince: null }).where(eq(teams.id, membership.teamId)).run();
    },
    { behavior: 'immediate' },
  );
}
