import { SecureStore } from './plugins.ts';

/** Zugangsdaten der App: Server, Access- und Refresh-Token. Liegen im verschlüsselten Speicher des Geräts. */
export interface StoredAuth {
  server: string | null;
  access: string | null;
  accessExpiresAt: number;
  refresh: string | null;
  refreshExpiresAt: number;
}

const KEY = 'auth';
const EMPTY: StoredAuth = {
  server: null,
  access: null,
  accessExpiresAt: 0,
  refresh: null,
  refreshExpiresAt: 0,
};

let cache: StoredAuth | null = null;

export async function loadAuth(): Promise<StoredAuth> {
  if (cache) return cache;
  try {
    const { value } = await SecureStore.get({ key: KEY });
    cache = value ? { ...EMPTY, ...(JSON.parse(value) as Partial<StoredAuth>) } : { ...EMPTY };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

async function persist(next: StoredAuth): Promise<void> {
  cache = next;
  await SecureStore.set({ key: KEY, value: JSON.stringify(next) });
}

export const currentAuth = (): StoredAuth => cache ?? EMPTY;
export const currentServer = (): string | null => currentAuth().server;

export const setServer = async (server: string) => persist({ ...EMPTY, server }); // anderer Server: alte Tokens verwerfen

export async function setTokens(
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresAt: number;
  },
  now = Date.now(),
) {
  await persist({
    ...currentAuth(),
    access: tokens.accessToken,
    accessExpiresAt: now + tokens.expiresIn * 1000,
    refresh: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
  });
}

/** Meldet ab: Tokens weg, Server bleibt gespeichert. */
export const clearTokens = () => persist({ ...EMPTY, server: currentAuth().server });

/** Alles löschen (Serverwechsel). */
export async function clearAll() {
  cache = { ...EMPTY };
  await SecureStore.remove({ key: KEY });
}
