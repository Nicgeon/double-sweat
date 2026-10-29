import { NATIVE } from '#lib/native/flag.ts';
import type { PushDistributor } from '#lib/native/plugins.ts';
import { disableUnified, enableUnified, syncUnified, unifiedActive } from './push-unified.ts';
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

/** Anbieter dieses Geräts: Web Push im Browser, UnifiedPush in der Android-App. */
export const PUSH_PROVIDER = NATIVE ? 'unifiedpush' : 'webpush';

export const pushSupported = () => (NATIVE ? true : webPushSupported());

/** Ist Push auf diesem Gerät eingeschaltet? */
export async function pushActive(): Promise<boolean> {
  return NATIVE ? unifiedActive() : (await currentSubscription()) !== null;
}

export async function enablePush(label: string, distributor?: string): Promise<EnableResult> {
  return NATIVE ? enableUnified(label, distributor) : enableWeb(label);
}

export async function disablePush(): Promise<void> {
  if (NATIVE) await disableUnified();
  else await disableWeb();
}

/** App: Endpunkt abgleichen (nach Anmeldung und beim Start). */
export async function syncPush(): Promise<void> {
  if (NATIVE) await syncUnified('Android-App');
}

export { describeAgent, deviceLabel } from './push-web.ts';
