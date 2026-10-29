import webpush from 'web-push';
import type { AppContext } from '../../context.js';
import type { PushSubscriptionRow } from '../../db/schema.js';
import { UnsafeUrlError } from '../../security/safe-fetch.js';
import { badRequest } from '../../util/errors.js';
import { createFcmProvider } from './fcm.js';
import { getVapidKeys } from './vapid.js';

export type ProviderId = 'webpush' | 'unifiedpush' | 'fcm';
/** ok = zugestellt, gone = Empfänger existiert nicht mehr, invalid = Anfrage/Ziel abgelehnt, retry = vorübergehend */
export type SendResult = 'ok' | 'gone' | 'invalid' | 'retry';

export interface PushPayload {
  type: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export interface DeliveryOptions {
  ttlSec: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
}

export interface SubscriptionInput {
  endpoint: string;
  keys?: { p256dh: string; auth: string } | undefined;
}

/** Austauschbarer Push-Anbieter. Neue Anbieter (z. B. FCM) implementieren nur dieses Interface. */
export interface PushProvider {
  readonly id: ProviderId;
  isConfigured(): boolean;
  /** Prüft eine neue Subscription (Schlüssel, Ziel-URL, SSRF) und wirft bei Ungültigem. */
  validate(input: SubscriptionInput): Promise<SubscriptionInput>;
  send(
    sub: PushSubscriptionRow,
    payload: PushPayload,
    options: DeliveryOptions,
  ): Promise<SendResult>;
}

function decodedLength(value: string): number {
  return Buffer.from(value, 'base64url').length;
}

function assertKeys(keys: SubscriptionInput['keys']): void {
  if (!keys) return;
  const p256dh = Buffer.from(keys.p256dh, 'base64url');
  if (p256dh.length !== 65 || p256dh[0] !== 0x04 || decodedLength(keys.auth) !== 16) {
    throw badRequest(
      'invalid_keys',
      'Die Verschlüsselungsschlüssel der Subscription sind ungültig',
    );
  }
}

async function assertSafeEndpoint(ctx: AppContext, endpoint: string): Promise<void> {
  try {
    await ctx.safeFetch.check(endpoint);
  } catch (error) {
    if (error instanceof UnsafeUrlError)
      throw badRequest('unsafe_endpoint', `Push-Ziel nicht erlaubt: ${error.message}`);
    throw badRequest('unsafe_endpoint', 'Push-Ziel nicht erreichbar oder nicht auflösbar');
  }
}

function mapStatus(status: number): SendResult {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'invalid'; // 3xx (Weiterleitungen werden nicht verfolgt), 400, 401, 403, 413 ...
}

async function post(
  ctx: AppContext,
  endpoint: string,
  headers: Record<string, string | number>,
  body: Buffer | null,
): Promise<SendResult> {
  try {
    const { status } = await ctx.safeFetch.request(endpoint, {
      method: 'POST',
      headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])),
      ...(body ? { body } : {}),
    });
    return mapStatus(status);
  } catch (error) {
    return error instanceof UnsafeUrlError ? 'invalid' : 'retry';
  }
}

const keysOf = (sub: PushSubscriptionRow) =>
  sub.p256dh && sub.auth ? { p256dh: sub.p256dh, auth: sub.auth } : null;

/** Web Push (RFC 8030/8291) mit VAPID. Läuft über den Push-Dienst des jeweiligen Browser-Herstellers. */
export function createWebPushProvider(ctx: AppContext): PushProvider {
  return {
    id: 'webpush',
    isConfigured: () => ctx.config.push.webPushEnabled,
    async validate(input) {
      if (!input.keys)
        throw badRequest('invalid_keys', 'Web Push braucht die Schlüssel p256dh und auth');
      assertKeys(input.keys);
      await assertSafeEndpoint(ctx, input.endpoint);
      return input;
    },
    async send(sub, payload, options) {
      const keys = keysOf(sub);
      if (!keys) return 'invalid';
      const vapid = getVapidKeys(ctx);
      const details = webpush.generateRequestDetails(
        { endpoint: sub.endpoint, keys },
        JSON.stringify(payload),
        {
          TTL: options.ttlSec,
          urgency: options.urgency,
          vapidDetails: { subject: ctx.config.push.vapidSubject, ...vapid },
        },
      );
      return post(ctx, sub.endpoint, details.headers as Record<string, string>, details.body);
    },
  };
}

/**
 * UnifiedPush (z. B. über ntfy). Liefert der Verteiler Schlüssel (RFC 8291), wird die Nachricht verschlüsselt.
 * Ohne Schlüssel läuft sie unverschlüsselt über den Verteiler und enthält deshalb nur einen neutralen Text.
 */
export function createUnifiedPushProvider(ctx: AppContext): PushProvider {
  return {
    id: 'unifiedpush',
    isConfigured: () => ctx.config.push.unifiedPushEnabled,
    async validate(input) {
      assertKeys(input.keys);
      await assertSafeEndpoint(ctx, input.endpoint);
      return input;
    },
    async send(sub, payload, options) {
      const keys = keysOf(sub);
      if (keys) {
        const details = webpush.generateRequestDetails(
          { endpoint: sub.endpoint, keys },
          JSON.stringify(payload),
          {
            TTL: options.ttlSec,
            urgency: options.urgency,
          },
        );
        return post(ctx, sub.endpoint, details.headers as Record<string, string>, details.body);
      }
      const neutral = JSON.stringify({
        type: payload.type,
        title: 'Double Sweat',
        body: 'Du hast eine neue Benachrichtigung.',
      });
      return post(
        ctx,
        sub.endpoint,
        {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(neutral),
          TTL: options.ttlSec,
          Urgency: options.urgency,
        },
        Buffer.from(neutral),
      );
    },
  };
}

export function createProviders(ctx: AppContext): Record<ProviderId, PushProvider> {
  return {
    webpush: createWebPushProvider(ctx),
    unifiedpush: createUnifiedPushProvider(ctx),
    fcm: createFcmProvider(ctx),
  };
}
