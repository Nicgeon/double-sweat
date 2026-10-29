import { createSign } from 'node:crypto';
import webpush from 'web-push';
import type { FcmConfig } from '../../config.js';
import type { AppContext } from '../../context.js';
import type { PushSubscriptionRow } from '../../db/schema.js';
import { UnsafeUrlError } from '../../security/safe-fetch.js';
import { badRequest } from '../../util/errors.js';
import type { DeliveryOptions, PushPayload, PushProvider, SendResult } from './providers.js';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** Gültigkeit der Anmeldung beim Dienstkonto; Google erlaubt höchstens eine Stunde. */
const JWT_TTL_SEC = 3600;
/** Ein Token wird kurz vor Ablauf erneuert. */
const REFRESH_MARGIN_MS = 60_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{20,2048}$/;

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

interface AccessToken {
  value: string;
  expiresAt: number;
}

/**
 * Firebase Cloud Messaging (HTTP v1) für Android-Geräte ohne UnifiedPush.
 *
 * Der Inhalt läuft Ende-zu-Ende verschlüsselt (RFC 8291, wie bei Web Push): Das Gerät erzeugt ein Schlüsselpaar und
 * meldet nur den öffentlichen Teil an. Google sieht dadurch nur, dass und wann eine Nachricht an ein Gerät geht,
 * nicht den Text. Deshalb ist die Registrierung ohne Schlüssel nicht möglich.
 */
export function createFcmProvider(ctx: AppContext): PushProvider {
  const fcm = (): FcmConfig => ctx.config.push.fcm as FcmConfig;
  let cached: AccessToken | null = null;
  let pending: Promise<string> | null = null;

  /** Meldet sich mit dem Dienstkonto an (signiertes JWT gegen Zugriffstoken) und merkt sich das Token bis kurz vor Ablauf. */
  async function requestToken(): Promise<string> {
    const cfg = fcm();
    const iat = Math.floor(ctx.clock.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
      JSON.stringify({
        iss: cfg.clientEmail,
        scope: SCOPE,
        aud: cfg.tokenUri,
        iat,
        exp: iat + JWT_TTL_SEC,
      }),
    )}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(cfg.privateKey);
    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }).toString();
    const { status, body } = await ctx.safeFetch.request(cfg.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: Buffer.from(form),
    });
    let parsed: { access_token?: unknown; expires_in?: unknown } = {};
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      /* unten als Fehler behandelt */
    }
    if (status !== 200 || typeof parsed.access_token !== 'string') {
      throw new Error(`token_${status}`);
    }
    const lifetime = typeof parsed.expires_in === 'number' ? parsed.expires_in : JWT_TTL_SEC;
    cached = { value: parsed.access_token, expiresAt: ctx.clock.now() + lifetime * 1000 };
    return parsed.access_token;
  }

  async function accessToken(force = false): Promise<string> {
    if (!force && cached && cached.expiresAt - REFRESH_MARGIN_MS > ctx.clock.now()) {
      return cached.value;
    }
    // Gleichzeitige Sendungen teilen sich eine Anmeldung
    pending ??= requestToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function post(message: object, token: string) {
    const cfg = fcm();
    return ctx.safeFetch.request(
      `${cfg.apiUrl}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: Buffer.from(JSON.stringify({ message })),
      },
    );
  }

  /** Fehlercode aus der Antwort von FCM, z. B. UNREGISTERED. */
  function errorCode(body: Buffer): string {
    try {
      const error = JSON.parse(body.toString('utf8')).error;
      const detail = (error?.details as { errorCode?: string }[] | undefined)?.find(
        (d) => typeof d.errorCode === 'string',
      );
      return detail?.errorCode ?? String(error?.status ?? '');
    } catch {
      return '';
    }
  }

  return {
    id: 'fcm',
    isConfigured: () => ctx.config.push.fcm !== null,

    async validate(input) {
      if (!input.keys) {
        throw badRequest(
          'invalid_keys',
          'FCM braucht die Schlüssel p256dh und auth: Nachrichten werden Ende-zu-Ende verschlüsselt',
        );
      }
      const p256dh = Buffer.from(input.keys.p256dh, 'base64url');
      if (
        p256dh.length !== 65 ||
        p256dh[0] !== 0x04 ||
        Buffer.from(input.keys.auth, 'base64url').length !== 16
      ) {
        throw badRequest(
          'invalid_keys',
          'Die Verschlüsselungsschlüssel der Subscription sind ungültig',
        );
      }
      if (!TOKEN_PATTERN.test(input.endpoint)) {
        throw badRequest('invalid_token', 'Das FCM-Token ist ungültig');
      }
      return input;
    },

    async send(
      sub: PushSubscriptionRow,
      payload: PushPayload,
      options: DeliveryOptions,
    ): Promise<SendResult> {
      if (!sub.p256dh || !sub.auth) return 'invalid';
      // Nur den verschlüsselten Körper verwenden; die "Adresse" ist hier bedeutungslos
      const details = webpush.generateRequestDetails(
        { endpoint: 'https://fcm.invalid/encrypt', keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: options.ttlSec, urgency: options.urgency },
      );
      const message = {
        token: sub.endpoint,
        data: { v: '1', p: b64url(details.body as Buffer) },
        android: {
          priority: options.urgency === 'high' ? 'HIGH' : 'NORMAL',
          ttl: `${options.ttlSec}s`,
        },
      };

      try {
        let res = await post(message, await accessToken());
        if (res.status === 401) {
          // Zugriffstoken abgelehnt (z. B. widerrufen): einmal frisch anmelden und wiederholen
          res = await post(message, await accessToken(true));
        }
        if (res.status >= 200 && res.status < 300) return 'ok';
        const code = errorCode(res.body);
        // Nur ein ausdrücklich abgemeldetes Gerät wird vergessen. Ein 404 aus anderem Grund (falsche Projekt-ID)
        // soll nicht alle Geräte löschen.
        if (code === 'UNREGISTERED') return 'gone';
        if (res.status === 429 || res.status >= 500) return 'retry';
        ctx.log.warn('fcm_rejected', { status: res.status, code });
        return 'invalid';
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          ctx.log.warn('fcm_unsafe_url', {});
          return 'invalid';
        }
        ctx.log.warn('fcm_unreachable', {
          error: error instanceof Error ? error.message : 'unknown',
        });
        return 'retry';
      }
    },
  };
}
