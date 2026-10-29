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

/** Link, mit dem die Web-Seite eine Einladung in der App öffnet. */
export function joinLinkFor(server: string, code: string): string {
  return `doublesweat://join?s=${encodeURIComponent(server)}&c=${encodeURIComponent(code)}`;
}
