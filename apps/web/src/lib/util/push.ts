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

/** Hinweise, wenn sich Push nicht einschalten lässt. */
export const PUSH_NOTES: Record<Exclude<PushSupport, 'ok' | 'choose'>, string> = {
  denied: 'Die Erlaubnis wurde abgelehnt. Du kannst sie in den Einstellungen deines Geräts ändern.',
  disabled: 'Dieser Server hat Push ausgeschaltet.',
  no_distributor:
    'Für Push brauchst du eine UnifiedPush-App, zum Beispiel ntfy, oder die App-Version mit Google-Benachrichtigungen (FCM), falls dein Server sie anbietet. Alles erscheint auch unter „Benachrichtigungen“.',
  unsupported:
    'Dieser Browser unterstützt keine Push-Benachrichtigungen (auf dem iPhone nur als installierte App).',
};

/** Was der Schalter nach einem Umschalten zeigen soll. */
export interface ToggleOutcome {
  /** Ist Push jetzt wirklich an? Der Schalter folgt diesem Wert, nie dem bloßen Antippen. */
  active: boolean;
  /** Mehrere Wege möglich und keiner gewählt: Auswahl anzeigen (der Schalter bleibt dabei aus). */
  choices: PushDistributor[] | null;
  note: string | null;
}

/**
 * Schaltet Push ein oder aus. Bei der Auswahl mehrerer Wege (UnifiedPush-App oder FCM) kommt zuerst `choices`
 * zurück; die Wahl wird mit `choice` erneut übergeben und liefert dann `active: true`.
 */
export async function togglePushState(
  on: boolean,
  label: string,
  choice?: string,
): Promise<ToggleOutcome> {
  if (!on) {
    await disablePush();
    return { active: false, choices: null, note: null };
  }
  const res = await enablePush(label, choice);
  if (res.status === 'choose') return { active: false, choices: res.distributors, note: null };
  if (res.status !== 'ok') return { active: false, choices: null, note: PUSH_NOTES[res.status] };
  return { active: true, choices: null, note: null };
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
