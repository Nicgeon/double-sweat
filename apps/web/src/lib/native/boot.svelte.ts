import { App } from '@capacitor/app';
import { closeTopOverlay } from '#lib/state/overlays.ts';
import { session } from '#lib/state/session.svelte.ts';
import { goto } from '$app/navigation';
import { backAction } from './back.ts';
import type { JoinLink } from './deeplink.ts';
import { parseJoinLink, parseOpenLink } from './deeplink.ts';
import { ALLOW_HTTP, NATIVE } from './flag.ts';

/** Einladung, die per Link in die App gekommen ist und auf Bestätigung des Servers wartet. */
class PendingJoin {
  link = $state<JoinLink | null>(null);
}
export const pendingJoin = new PendingJoin();

/**
 * Verarbeitet einen geöffneten Link der App: doublesweat://join?... (Einladung) oder doublesweat://open?path=...
 * (Tipp auf eine Mitteilung). Fremde und ungültige Links werden ignoriert.
 */
export async function handleOpenedUrl(url: string): Promise<void> {
  const target = parseOpenLink(url);
  if (target) {
    await goto(target);
    return;
  }
  const link = parseJoinLink(url);
  if (!link) return;
  if (link.server === session.serverUrl) {
    await goto(`/join/${link.code}`);
    return;
  }
  // Anderer oder noch unbekannter Server: erst bestätigen lassen (Schutz vor Phishing-Einladungen)
  pendingJoin.link = link;
}

/** Hört auf Links, die die App öffnen (auch beim Kaltstart). Gibt eine Funktion zum Abmelden des Listeners zurück. */
export async function startDeepLinks(): Promise<() => void> {
  if (!NATIVE) return () => {};
  // Nur im Testbuild (http erlaubt): Links lassen sich im Browser auslösen, wo es keinen Intent gibt
  if (ALLOW_HTTP)
    (window as unknown as { __dsOpenUrl?: typeof handleOpenedUrl }).__dsOpenUrl = handleOpenedUrl;
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handleOpenedUrl(launch.url);
  const handle = await App.addListener('appUrlOpen', (event) => void handleOpenedUrl(event.url));
  return () => void handle.remove();
}

/**
 * Zurück-Knopf der App: zuerst das oberste Fenster schließen, dann eine Unterseite zurück, von einer Tab-Wurzel zu
 * "Heute", auf "Heute" die App beenden. Gibt zurück, was geschehen ist (für Tests).
 */
export async function handleBack(
  canGoBack: boolean,
): Promise<'overlay' | 'history' | 'goto' | 'exit'> {
  if (closeTopOverlay()) return 'overlay';
  const action = backAction(window.location.pathname, window.location.search, canGoBack);
  if (action.type === 'history') window.history.back();
  else if (action.type === 'goto') await goto(action.to);
  else await App.exitApp().catch(() => {});
  return action.type;
}

/** Hört auf den Zurück-Knopf (Android). Ohne diesen Listener beendet er die App oder geht blind im Verlauf zurück. */
export async function startBackButton(): Promise<() => void> {
  if (!NATIVE) return () => {};
  // Nur im Testbuild: im Browser gibt es keinen Zurück-Knopf der App
  if (ALLOW_HTTP) (window as unknown as { __dsBack?: typeof handleBack }).__dsBack = handleBack;
  const handle = await App.addListener('backButton', (event) => void handleBack(event.canGoBack));
  return () => void handle.remove();
}
