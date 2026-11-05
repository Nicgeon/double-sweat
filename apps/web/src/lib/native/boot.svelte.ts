import { App } from '@capacitor/app';
import { session } from '#lib/state/session.svelte.ts';
import { goto } from '$app/navigation';
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
