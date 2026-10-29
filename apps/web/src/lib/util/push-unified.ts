import { api, unwrap } from '#lib/api/client.ts';
import { type PushDistributor, SecureStore, UnifiedPush } from '#lib/native/plugins.ts';
import type { EnableResult } from './push.ts';

const KEY = 'push_subscription';
interface Stored {
  id: string;
  endpoint: string;
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

async function announce(
  endpoint: string,
  p256dh: string | undefined,
  auth: string | undefined,
  label: string,
) {
  const res = unwrap(
    await api.POST('/api/v1/push/subscriptions', {
      body: {
        provider: 'unifiedpush',
        endpoint,
        keys: p256dh && auth ? { p256dh, auth } : undefined,
        deviceLabel: label,
      },
    }),
  );
  return res.subscription.id;
}

export async function unifiedActive(): Promise<boolean> {
  return (await load()) !== null && (await UnifiedPush.current()).registration !== null;
}

/**
 * Schaltet Push über einen UnifiedPush-Verteiler (z. B. die ntfy-App) ein. Gibt es mehrere Verteiler und keinen
 * gewählten, kommt die Auswahl zurück; der Aufrufer fragt nach und ruft erneut mit `distributor` auf.
 */
export async function enableUnified(label: string, distributor?: string): Promise<EnableResult> {
  const { granted } = await UnifiedPush.requestNotificationPermission();
  if (!granted) return { status: 'denied' };
  const { distributors, current } = await UnifiedPush.getDistributors();
  if (distributors.length === 0) return { status: 'no_distributor' };
  const chosen =
    distributor ?? current ?? (distributors.length === 1 ? distributors[0]?.id : undefined);
  if (!chosen) return { status: 'choose', distributors };
  const reg = await UnifiedPush.register({ distributor: chosen });
  const id = await announce(reg.endpoint, reg.p256dh, reg.auth, label);
  await save({ id, endpoint: reg.endpoint });
  return { status: 'ok', id };
}

export async function disableUnified(): Promise<void> {
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
  await UnifiedPush.unregister();
  await forget();
}

/**
 * Meldet einen geänderten Endpunkt beim Server an (der Verteiler kann ihn wechseln, auch wenn die App nicht lief).
 * Wird nach der Anmeldung und beim Start aufgerufen.
 */
export async function syncUnified(label: string): Promise<void> {
  const stored = await load();
  if (!stored) return;
  const { registration } = await UnifiedPush.current();
  if (!registration) return;
  if (registration.endpoint === stored.endpoint) return;
  const id = await announce(registration.endpoint, registration.p256dh, registration.auth, label);
  try {
    unwrap(
      await api.DELETE('/api/v1/push/subscriptions/{id}', { params: { path: { id: stored.id } } }),
    );
  } catch {
    /* alte Anmeldung ist schon weg */
  }
  await save({ id, endpoint: registration.endpoint });
}

export type { PushDistributor };
