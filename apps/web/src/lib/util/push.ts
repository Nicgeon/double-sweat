import { NATIVE } from '#lib/native/flag.ts';
import type { PushDistributor } from '#lib/native/plugins.ts';
import { disableNative, enableNative, nativeActive, syncNative } from './push-native.ts';
import {
  currentSubscription,
  disablePush as disableWeb,
  enablePush as enableWeb,
  webPushSupported,
} from './push-web.ts';

export type PushSupport =
  | 'ok'
  | 'unsupported'
  | 'disabled'
  | 'denied'
  | 'no_distributor'
  | 'choose';

export type EnableResult =
  | { status: 'ok'; id?: string }
  | { status: Exclude<PushSupport, 'ok' | 'choose'> }
  | { status: 'choose'; distributors: PushDistributor[] };

/** Anbieter dieses Geräts im Browser: Web Push. In der Android-App wählt push-native.ts zwischen UnifiedPush und FCM. */
export const PUSH_PROVIDER = NATIVE ? 'unifiedpush' : 'webpush';

export const pushSupported = () => (NATIVE ? true : webPushSupported());

/** Ist Push auf diesem Gerät eingeschaltet? */
export async function pushActive(): Promise<boolean> {
  return NATIVE ? nativeActive() : (await currentSubscription()) !== null;
}

export async function enablePush(label: string, distributor?: string): Promise<EnableResult> {
  return NATIVE ? enableNative(label, distributor) : enableWeb(label);
}

export async function disablePush(): Promise<void> {
  if (NATIVE) await disableNative();
  else await disableWeb();
}

/** App: Endpunkt abgleichen (nach Anmeldung und beim Start). */
export async function syncPush(): Promise<void> {
  if (NATIVE) await syncNative('Android-App');
}

export { describeAgent, deviceLabel } from './push-web.ts';
