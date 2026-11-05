import { normalizeServerUrl } from './server-url.ts';

export interface JoinLink {
  /** Ursprungsadresse des Servers */
  server: string;
  code: string;
}

const CODE = /^[0-9A-Za-z-]{8,64}$/;

/** Liest einen Einladungslink der App: doublesweat://join?s=<Server>&c=<Code>. Alles andere ergibt null. */
export function parseJoinLink(raw: string): JoinLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'doublesweat:' || url.hostname !== 'join') return null;
  const s = url.searchParams.get('s');
  const c = url.searchParams.get('c');
  if (!s || !c || !CODE.test(c)) return null;
  try {
    return { server: normalizeServerUrl(s), code: c };
  } catch {
    return null;
  }
}

/** Ziele, die ein Tipp auf eine Mitteilung öffnen darf: bekannte Seiten, bei der Startseite optional ein Foto. */
const OPEN_PATH =
  /^\/(?:deal|history|checkin|notifications|profile(?:\/health)?)?(?:\?photo=[0-9A-Za-z_-]{1,40})?$/;

/**
 * Liest den Link einer Mitteilung der App: doublesweat://open?path=/deal. Es zählen nur bekannte Pfade der App; jeder
 * andere Link (fremde Adresse, unbekannte Seite) ergibt null, auch wenn eine andere App ihn abschickt.
 */
export function parseOpenLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'doublesweat:' || url.hostname !== 'open') return null;
  const path = url.searchParams.get('path');
  return path !== null && OPEN_PATH.test(path) ? path : null;
}

/** Link, mit dem die Web-Seite eine Einladung in der App öffnet. */
export function joinLinkFor(server: string, code: string): string {
  return `doublesweat://join?s=${encodeURIComponent(server)}&c=${encodeURIComponent(code)}`;
}
