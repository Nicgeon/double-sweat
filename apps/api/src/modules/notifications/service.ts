import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { type NotificationRow, notifications, type User } from '../../db/schema.js';
import type { Locale } from '../../i18n/locales.js';
import {
  isNotificationType,
  type NotificationParams,
  type NotificationType,
  renderNotification,
} from '../../i18n/notifications.js';
import { newId } from '../../util/ids.js';
import { linkFor } from './prefs.js';

export type { NotificationType };

/** Eine Mitteilung: Art und Parameter. Den Text erzeugt der Server in der Sprache des Empfängers. */
export interface NotificationInput {
  type: NotificationType;
  /** Werte für die Vorlage (z. B. Name, Einsatz); werden gespeichert, damit der Text später neu erzeugt werden kann. */
  params?: NotificationParams;
  /** Zusätzliche Angaben für Clients (IDs, Wochenstart); nicht Teil des Textes. */
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
  /** Wohin die App beim Antippen führt (Pfad), null = nirgends hin */
  link: string | null;
}

/** Text einer gespeicherten Mitteilung: in der aktuellen Sprache neu erzeugt, wenn Parameter vorliegen. */
function textOf(row: NotificationRow, locale: Locale): { title: string; body: string } {
  if (row.paramsJson && isNotificationType(row.type)) {
    try {
      return renderNotification(locale, row.type, JSON.parse(row.paramsJson) as NotificationParams);
    } catch {
      /* gespeicherter Text bleibt */
    }
  }
  return { title: row.title, body: row.body };
}

const toDto = (row: NotificationRow, locale: Locale): NotificationDto => {
  const data = row.dataJson ? (JSON.parse(row.dataJson) as Record<string, unknown>) : null;
  return {
    id: row.id,
    type: row.type,
    ...textOf(row, locale),
    data,
    createdAt: row.createdAt,
    read: row.readAt !== null,
    link: isNotificationType(row.type) ? linkFor(row.type, data) : null,
  };
};

/** Legt die Benachrichtigung im Postfach des Nutzers ab. Das Postfach funktioniert auch ohne Push. */
export function storeNotification(
  ctx: AppContext,
  userId: string,
  input: NotificationInput,
  text: { title: string; body: string },
): string {
  const now = ctx.clock.now();
  const id = newId(now);
  ctx.db
    .insert(notifications)
    .values({
      id,
      userId,
      type: input.type,
      title: text.title,
      body: text.body,
      dataJson: input.data ? JSON.stringify(input.data) : null,
      paramsJson: input.params ? JSON.stringify(input.params) : null,
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
  return { notifications: rows.map((row) => toDto(row, user.locale)), unreadCount: unread };
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
