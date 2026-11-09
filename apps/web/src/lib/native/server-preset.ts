import { ALLOW_HTTP, NATIVE } from './flag.ts';
import { normalizeServerUrl } from './server-url.ts';

/**
 * Server, auf den eine App-Version fest eingestellt ist (Build-Einstellung `DS_SERVER_URL`, optional mit
 * `DS_SERVER_LOCK`). Ohne Einstellung ist `url` null und alles läuft wie gewohnt.
 */
export interface ServerPreset {
  /** Ursprungsadresse ("https://host"), die die App vorschlägt (nicht gesperrt) oder erzwingt (gesperrt) */
  url: string | null;
  /** true: Die Adresse steht fest. Die App wechselt nicht, kennt keine Eingabe und ignoriert Einladungen anderer Server. */
  locked: boolean;
}

const NONE: ServerPreset = { url: null, locked: false };

/**
 * Macht aus den beiden Build-Werten die Voreinstellung. Eine ungültige Adresse (die das Bauskript nicht durchlässt)
 * ergibt keine Voreinstellung, nie eine halbe: Eine gesperrte App ohne gültige Adresse wäre unbenutzbar.
 */
export function resolvePreset(
  raw: { url?: string | undefined; locked?: string | boolean | undefined },
  allowHttp: boolean,
): ServerPreset {
  const url = raw.url?.trim();
  if (!url) return NONE;
  try {
    return {
      url: normalizeServerUrl(url, allowHttp),
      locked: raw.locked === true || raw.locked === 'true',
    };
  } catch {
    return NONE;
  }
}

/** Nur im Testbuild: Tests setzen `window.__dsServerPreset`, ohne die App neu zu bauen. */
interface PresetOverride {
  url?: string;
  locked?: boolean;
}

/** Die Voreinstellung dieser App-Version (nur in der Android-App; die Web-App kennt ihren Server selbst). */
export function serverPreset(): ServerPreset {
  if (!NATIVE) return NONE;
  const override = ALLOW_HTTP
    ? (window as unknown as { __dsServerPreset?: PresetOverride }).__dsServerPreset
    : undefined;
  return resolvePreset(
    override ?? {
      url: import.meta.env.VITE_DEFAULT_SERVER,
      locked: import.meta.env.VITE_SERVER_LOCKED,
    },
    ALLOW_HTTP,
  );
}
