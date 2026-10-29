import { and, count, eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { type PushSubscriptionRow, pushSubscriptions, type User } from '../../db/schema.js';
import { badRequest, conflict, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import {
  type NotificationInput,
  type NotificationType,
  storeNotification,
} from '../notifications/service.js';
import {
  createProviders,
  type DeliveryOptions,
  type ProviderId,
  type PushProvider,
  type SubscriptionInput,
} from './providers.js';
import { getVapidKeys } from './vapid.js';

export const MAX_SUBSCRIPTIONS_PER_USER = 10;
/** Nach so vielen Fehlversuchen in Folge wird eine Subscription entfernt. */
export const MAX_FAILURES = 10;

const DELIVERY: Record<NotificationType, DeliveryOptions> = {
  nudge: { ttlSec: 3600, urgency: 'high' },
  reminder: { ttlSec: 7200, urgency: 'normal' },
  debt_created: { ttlSec: 86_400, urgency: 'normal' },
  reward_set: { ttlSec: 86_400, urgency: 'normal' },
  reward_earned: { ttlSec: 86_400, urgency: 'normal' },
  reaction: { ttlSec: 3600, urgency: 'low' },
  team_dissolved: { ttlSec: 86_400, urgency: 'normal' },
  test: { ttlSec: 60, urgency: 'high' },
};

export interface SubscriptionDto {
  id: string;
  provider: ProviderId;
  deviceLabel: string | null;
  createdAt: number;
  lastSuccessAt: number | null;
  /** Aufeinanderfolgende Fehlversuche */
  failures: number;
}

export interface RegisterInput extends SubscriptionInput {
  provider: ProviderId;
  deviceLabel?: string | undefined;
}

export interface PushConfig {
  webpush: { enabled: boolean; publicKey: string | null };
  unifiedpush: { enabled: boolean };
  fcm: { enabled: boolean };
}

export interface PushService {
  config(): PushConfig;
  register(user: User, input: RegisterInput): Promise<SubscriptionDto>;
  list(user: User): SubscriptionDto[];
  remove(user: User, id: string): void;
  /** Legt die Nachricht im Postfach ab und stellt sie danach im Hintergrund per Push zu. */
  notify(userId: string, input: NotificationInput): string;
  sendTest(user: User): string;
}

const toDto = (row: PushSubscriptionRow): SubscriptionDto => ({
  id: row.id,
  provider: row.provider,
  deviceLabel: row.deviceLabel,
  createdAt: row.createdAt,
  lastSuccessAt: row.lastSuccessAt,
  failures: row.failureCount,
});

export function createPushService(ctx: AppContext): PushService {
  const providers = createProviders(ctx);
  const provider = (id: ProviderId): PushProvider => providers[id];

  async function deliver(sub: PushSubscriptionRow, input: NotificationInput): Promise<void> {
    const p = provider(sub.provider);
    if (!p.isConfigured()) return;
    const result = await p.send(
      sub,
      { type: input.type, title: input.title, body: input.body, tag: input.type, url: '/' },
      DELIVERY[input.type],
    );
    if (result === 'ok') {
      ctx.db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: ctx.clock.now(), failureCount: 0 })
        .where(eq(pushSubscriptions.id, sub.id))
        .run();
    } else if (result === 'gone' || sub.failureCount + 1 >= MAX_FAILURES) {
      ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
    } else {
      ctx.db
        .update(pushSubscriptions)
        .set({ failureCount: sub.failureCount + 1 })
        .where(eq(pushSubscriptions.id, sub.id))
        .run();
    }
  }

  return {
    config() {
      return {
        webpush: {
          enabled: providers.webpush.isConfigured(),
          publicKey: providers.webpush.isConfigured() ? getVapidKeys(ctx).publicKey : null,
        },
        unifiedpush: { enabled: providers.unifiedpush.isConfigured() },
        fcm: { enabled: providers.fcm.isConfigured() },
      };
    },

    async register(user, input) {
      const p = provider(input.provider);
      if (!p.isConfigured())
        throw badRequest(
          'provider_disabled',
          'Dieser Push-Anbieter ist auf dem Server abgeschaltet',
        );
      const valid = await p.validate({ endpoint: input.endpoint, keys: input.keys });
      const now = ctx.clock.now();
      const row = ctx.db.transaction(
        (tx) => {
          const existing = tx
            .select()
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, valid.endpoint))
            .get();
          // Ein Endpunkt gehört genau einem Konto. Fremde Endpunkte werden nicht übernommen.
          if (existing && existing.userId !== user.id) {
            throw conflict(
              'endpoint_in_use',
              'Dieses Gerät ist bereits für ein anderes Konto registriert',
            );
          }
          if (existing) {
            tx.update(pushSubscriptions)
              .set({
                provider: input.provider,
                p256dh: valid.keys?.p256dh ?? null,
                auth: valid.keys?.auth ?? null,
                deviceLabel: input.deviceLabel?.slice(0, 80) ?? existing.deviceLabel,
                failureCount: 0,
              })
              .where(eq(pushSubscriptions.id, existing.id))
              .run();
            return tx
              .select()
              .from(pushSubscriptions)
              .where(eq(pushSubscriptions.id, existing.id))
              .get()!;
          }
          const owned =
            tx
              .select({ n: count() })
              .from(pushSubscriptions)
              .where(eq(pushSubscriptions.userId, user.id))
              .get()?.n ?? 0;
          if (owned >= MAX_SUBSCRIPTIONS_PER_USER) {
            throw conflict(
              'too_many_subscriptions',
              'Zu viele registrierte Geräte, bitte nicht benötigte entfernen',
            );
          }
          const created = {
            id: newId(now),
            userId: user.id,
            provider: input.provider,
            endpoint: valid.endpoint,
            p256dh: valid.keys?.p256dh ?? null,
            auth: valid.keys?.auth ?? null,
            deviceLabel: input.deviceLabel?.slice(0, 80) ?? null,
            createdAt: now,
            lastSuccessAt: null,
            failureCount: 0,
          };
          tx.insert(pushSubscriptions).values(created).run();
          return created;
        },
        { behavior: 'immediate' },
      );
      return toDto(row);
    },

    list(user) {
      return ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id))
        .all()
        .map(toDto);
    },

    remove(user, id) {
      const removed = ctx.db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id)))
        .run().changes;
      if (!removed) throw notFound('Gerät nicht gefunden');
    },

    notify(userId, input) {
      const id = storeNotification(ctx, userId, input);
      ctx.defer(async () => {
        const subs = ctx.db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId))
          .all();
        for (const sub of subs) {
          try {
            await deliver(sub, input);
          } catch (error) {
            ctx.log.error('push_delivery_failed', {
              error: error instanceof Error ? error.name : 'unknown',
            });
          }
        }
      });
      return id;
    },

    sendTest(user) {
      const limit = ctx.limiter.hit(`push-test:${user.id}`, 5, HOUR);
      if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
      return this.notify(user.id, {
        type: 'test',
        title: 'Double Sweat',
        body: 'Test erfolgreich: Benachrichtigungen kommen an.',
      });
    },
  };
}
