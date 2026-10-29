import { api, unwrap } from '#lib/api/client.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import {
  Fcm,
  type PushDistributor,
  type PushRegistration,
  SecureStore,
  UnifiedPush,
} from '#lib/native/plugins.ts';
import type { EnableResult } from './push.ts';

type NativeProvider = 'unifiedpush' | 'fcm';

const KEY = 'push_subscription';
interface Stored {
  id: string;
  endpoint: string;
  /** Fehlt bei Einträgen aus älteren App-Versionen: damals gab es nur UnifiedPush. */
  provider?: NativeProvider;
}

async function load(): Promise<Stored | null> {
  try {
    const { value } = await SecureStore.get({ key: KEY });
    return value ? (JSON.parse(value) as Stored) : null;
  } catch {
    return null;
  }
}
const save = (s: Stored) => SecureStore.set({ key: KEY, value: JSON.stringify(s) });
const forget = () => SecureStore.remove({ key: KEY });

const providerOf = (s: Stored): NativeProvider => s.provider ?? 'unifiedpush';

/** Auswahlpunkt für FCM neben den UnifiedPush-Apps. */
export const fcmChoice = (): PushDistributor => ({
  id: 'fcm',
  label: t('push.fcmLabel'),
  hint: t('push.fcmHint'),
});

export type Plan =
  | { kind: 'unified'; distributor: string }
  | { kind: 'fcm' }
  | { kind: 'choose'; options: PushDistributor[] }
  | { kind: 'none'; reason: 'no_distributor' | 'disabled' };

/**
 * Entscheidet, wie Push auf diesem Gerät läuft. UnifiedPush ist die erste Wahl (kein Google nötig); FCM gibt es nur,
 * wenn der Server es anbietet und dieser Build es enthält. Ist mehr als ein Weg möglich und nichts gewählt, fragt
 * die App nach.
 */
export function planPush(input: {
  /** Ausdrückliche Wahl: Paketname eines Verteilers oder "fcm". */
  requested?: string | undefined;
  distributors: PushDistributor[];
  /** Zuletzt gewählter Verteiler. */
  savedDistributor: string | null;
  unifiedEnabled: boolean;
  fcmUsable: boolean;
}): Plan {
  const candidates = input.unifiedEnabled ? input.distributors : [];
  if (input.requested === 'fcm') {
    return input.fcmUsable ? { kind: 'fcm' } : { kind: 'none', reason: 'disabled' };
  }
  if (input.requested) {
    return candidates.some((d) => d.id === input.requested)
      ? { kind: 'unified', distributor: input.requested }
      : { kind: 'none', reason: 'no_distributor' };
  }
  if (candidates.length === 0) {
    if (input.fcmUsable) return { kind: 'fcm' };
    return { kind: 'none', reason: input.unifiedEnabled ? 'no_distributor' : 'disabled' };
  }
  const saved = candidates.find((d) => d.id === input.savedDistributor);
  if (saved) return { kind: 'unified', distributor: saved.id };
  if (!input.fcmUsable) {
    const [only] = candidates;
    return candidates.length === 1 && only
      ? { kind: 'unified', distributor: only.id }
      : { kind: 'choose', options: candidates };
  }
  return { kind: 'choose', options: [...candidates, fcmChoice()] };
}

async function announce(
  provider: NativeProvider,
  reg: PushRegistration,
  label: string,
): Promise<string> {
  const keys = reg.p256dh && reg.auth ? { p256dh: reg.p256dh, auth: reg.auth } : undefined;
  const body =
    provider === 'fcm'
      ? keys
        ? { provider, endpoint: reg.endpoint, keys, deviceLabel: label }
        : null
      : { provider, endpoint: reg.endpoint, keys, deviceLabel: label };
  if (!body) throw new Error('FCM ohne Schlüssel');
  return unwrap(await api.POST('/api/v1/push/subscriptions', { body })).subscription.id;
}

async function currentRegistration(provider: NativeProvider): Promise<PushRegistration | null> {
  return (provider === 'fcm' ? await Fcm.current() : await UnifiedPush.current()).registration;
}

export async function nativeActive(): Promise<boolean> {
  const stored = await load();
  return stored !== null && (await currentRegistration(providerOf(stored))) !== null;
}

/**
 * Schaltet Push ein: über einen UnifiedPush-Verteiler (z. B. ntfy) oder über FCM. Gibt es mehrere Wege und keine
 * Wahl, kommt die Auswahl zurück; der Aufrufer fragt nach und ruft erneut mit `choice` auf.
 */
export async function enableNative(label: string, choice?: string): Promise<EnableResult> {
  const { granted } = await UnifiedPush.requestNotificationPermission();
  if (!granted) return { status: 'denied' };

  const config = unwrap(await api.GET('/api/v1/push/config'));
  const [{ distributors, current }, { available }] = await Promise.all([
    UnifiedPush.getDistributors(),
    Fcm.isAvailable().catch(() => ({ available: false })),
  ]);
  const plan = planPush({
    requested: choice,
    distributors,
    savedDistributor: current,
    unifiedEnabled: config.unifiedpush.enabled,
    fcmUsable: available && config.fcm.enabled,
  });
  if (plan.kind === 'none') return { status: plan.reason };
  if (plan.kind === 'choose') return { status: 'choose', distributors: plan.options };

  // Wechsel des Weges: die alte Anmeldung zuerst abbauen, damit das Gerät nicht doppelt Nachrichten bekommt
  if (await load()) await disableNative();

  const provider: NativeProvider = plan.kind === 'fcm' ? 'fcm' : 'unifiedpush';
  const reg =
    plan.kind === 'fcm'
      ? await Fcm.register()
      : await UnifiedPush.register({ distributor: plan.distributor });
  const id = await announce(provider, reg, label);
  await save({ id, endpoint: reg.endpoint, provider });
  return { status: 'ok', id };
}

export async function disableNative(): Promise<void> {
  const stored = await load();
  if (stored) {
    try {
      unwrap(
        await api.DELETE('/api/v1/push/subscriptions/{id}', {
          params: { path: { id: stored.id } },
        }),
      );
    } catch {
      /* Server kennt das Gerät nicht mehr */
    }
  }
  const provider = stored ? providerOf(stored) : null;
  if (provider !== 'fcm') await UnifiedPush.unregister();
  if (provider !== 'unifiedpush') await Fcm.unregister();
  await forget();
}

/**
 * Meldet einen geänderten Endpunkt beim Server an (UnifiedPush-Verteiler oder FCM können ihn wechseln, auch wenn die
 * App nicht lief). Wird nach der Anmeldung und beim Start aufgerufen.
 */
export async function syncNative(label: string): Promise<void> {
  const stored = await load();
  if (!stored) return;
  const provider = providerOf(stored);
  const registration = await currentRegistration(provider);
  if (!registration) return;
  if (registration.endpoint === stored.endpoint) return;
  const id = await announce(provider, registration, label);
  try {
    unwrap(
      await api.DELETE('/api/v1/push/subscriptions/{id}', { params: { path: { id: stored.id } } }),
    );
  } catch {
    /* alte Anmeldung ist schon weg */
  }
  await save({ id, endpoint: registration.endpoint, provider });
}

export type { PushDistributor };
