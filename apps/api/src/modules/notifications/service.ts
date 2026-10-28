import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { type NotificationRow, notifications, type User } from '../../db/schema.js';
import { newId } from '../../util/ids.js';

export type NotificationType = 'nudge' | 'reminder' | 'debt_created' | 'team_dissolved' | 'test';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  createdAt: number;
  read: boolean;
}

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: row.dataJson ? (JSON.parse(row.dataJson) as Record<string, unknown>) : null,
  createdAt: row.createdAt,
  read: row.readAt !== null,
});

/** Legt die Benachrichtigung im Postfach des Nutzers ab. Das Postfach funktioniert auch ohne Push. */
export function storeNotification(
  ctx: AppContext,
  userId: string,
  input: NotificationInput,
): string {
  const now = ctx.clock.now();
  const id = newId(now);
  ctx.db
    .insert(notifications)
    .values({
      id,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      dataJson: input.data ? JSON.stringify(input.data) : null,
      createdAt: now,
    })
    .run();
  return id;
}

export function listNotifications(
  ctx: AppContext,
  user: User,
  options: { limit: number; unreadOnly: boolean; before?: number | undefined },
): { notifications: NotificationDto[]; unreadCount: number } {
  const conditions = [eq(notifications.userId, user.id)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (options.before !== undefined) conditions.push(lt(notifications.createdAt, options.before));
  const rows = ctx.db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(options.limit)
    .all();
  const unread = ctx.db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .all().length;
  return { notifications: rows.map(toDto), unreadCount: unread };
}

/** Markiert eigene Benachrichtigungen als gelesen: bestimmte (ids) oder alle ungelesenen. */
export function markRead(ctx: AppContext, user: User, ids?: string[]): number {
  const scope = ids?.length
    ? and(
        eq(notifications.userId, user.id),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      )
    : and(eq(notifications.userId, user.id), isNull(notifications.readAt));
  return ctx.db.update(notifications).set({ readAt: ctx.clock.now() }).where(scope).run().changes;
}
