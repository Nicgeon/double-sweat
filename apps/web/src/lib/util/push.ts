import { api, unwrap } from '#lib/api/client.ts';

export type PushSupport = 'ok' | 'unsupported' | 'disabled' | 'denied';

const b64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};
const bytesToB64Url = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return '';
  let s = '';
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  window.isSecureContext;

/** Registriert den Service Worker (nur für Push; er speichert nichts zwischen). */
export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Aktuelles Abo dieses Browsers (oder null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Fragt die Erlaubnis ab, abonniert und meldet das Gerät beim Server an. */
export async function enablePush(
  deviceLabel: string,
): Promise<{ status: PushSupport; id?: string }> {
  if (!pushSupported()) return { status: 'unsupported' };
  const config = unwrap(await api.GET('/api/v1/push/config'));
  if (!config.webpush.enabled || !config.webpush.publicKey) return { status: 'disabled' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };
  const reg = await registerWorker();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(config.webpush.publicKey),
    }));
  const res = unwrap(
    await api.POST('/api/v1/push/subscriptions', {
      body: {
        provider: 'webpush',
        endpoint: sub.endpoint,
        keys: {
          p256dh: bytesToB64Url(sub.getKey('p256dh')),
          auth: bytesToB64Url(sub.getKey('auth')),
        },
        deviceLabel,
      },
    }),
  );
  return { status: 'ok', id: res.subscription.id };
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  await sub?.unsubscribe();
}

/** Kurze Beschreibung eines Browsers aus dem User-Agent ("Chrome auf Android"). */
export function describeAgent(ua: string): string {
  const browser = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return `${browser}${os ? ` auf ${os}` : ''}`.slice(0, 80);
}

/** Kurze Beschreibung dieses Geräts für die Geräteliste. */
export const deviceLabel = () => describeAgent(navigator.userAgent);
