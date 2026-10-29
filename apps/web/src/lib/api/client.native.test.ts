import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

async function setup(auth: { access: string; accessExpiresAt: number; refresh: string }) {
  vi.resetModules();
  vi.stubEnv('VITE_TARGET', 'native');
  store.clear();
  store.set(
    'ds_native_auth',
    JSON.stringify({ server: 'https://s.example', refreshExpiresAt: Date.now() + 86_400_000, ...auth }),
  );
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  const authStore = await import('#lib/native/auth-store.ts');
  await authStore.loadAuth();
  const client = await import('./client.ts');
  return { authStore, client };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const tokens = (n: number) => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresIn: 900, refreshExpiresAt: Date.now() + 86_400_000 });

describe('API-Client in der App (Bearer-Tokens)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sendet Anfragen an die gespeicherte Adresse mit Bearer-Token und ohne Cookies', async () => {
    const { client } = await setup({ access: 'a1', accessExpiresAt: Date.now() + 600_000, refresh: 'r1' });
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await client.send(new Request('http://localhost/api/v1/dashboard?x=1'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://s.example/api/v1/dashboard?x=1');
    expect((init.headers as Headers).get('authorization')).toBe('Bearer a1');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Headers).get('x-csrf-token')).toBeNull();
  });

  it('erneuert bei 401 genau einmal und wiederholt die Anfrage samt Body', async () => {
    const { client, authStore } = await setup({ access: 'alt', accessExpiresAt: Date.now() + 600_000, refresh: 'r1' });
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'r1' });
          return json({ tokens: tokens(2) });
        }
        const bearer = (init.headers as Headers).get('authorization');
        seen.push(`${bearer} ${init.body ? new TextDecoder().decode(init.body as ArrayBuffer) : ''}`.trim());
        return bearer === 'Bearer a2' ? json({ ok: true }) : json({ error: { code: 'unauthorized' } }, 401);
      }),
    );
    const res = await client.send(new Request('http://localhost/api/v1/goals/next', { method: 'PUT', body: '{"days":3}', headers: { 'content-type': 'application/json' } }));
    expect(res.status).toBe(200);
    expect(seen).toEqual(['Bearer alt {"days":3}', 'Bearer a2 {"days":3}']);
    expect(authStore.currentAuth()).toMatchObject({ access: 'a2', refresh: 'r2' });
    expect(JSON.parse(store.get('ds_native_auth') ?? '{}')).toMatchObject({ access: 'a2', refresh: 'r2' });
  });

  it('erneuert vorab, wenn das Access-Token fast abgelaufen ist, und nur einmal bei parallelen Anfragen', async () => {
    const { client } = await setup({ access: 'a1', accessExpiresAt: Date.now() + 5_000, refresh: 'r1' });
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshes++;
          await Promise.resolve();
          return json({ tokens: tokens(2) });
        }
        return (init.headers as Headers).get('authorization') === 'Bearer a2' ? json({ ok: true }) : json({}, 401);
      }),
    );
    const results = await Promise.all([1, 2, 3].map(() => client.send(new Request('http://localhost/api/v1/me'))));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it('meldet ab (Tokens weg, Server bleibt), wenn die Erneuerung abgelehnt wird', async () => {
    const { client, authStore } = await setup({ access: 'alt', accessExpiresAt: Date.now() + 600_000, refresh: 'r1' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json({ error: { code: 'invalid_token' } }, 401) : json({}, 401))),
    );
    const res = await client.send(new Request('http://localhost/api/v1/me'));
    expect(res.status).toBe(401);
    expect(authStore.currentAuth()).toMatchObject({ server: 'https://s.example', access: null, refresh: null });
  });

  it('behält die Tokens bei einem Netzfehler während der Erneuerung', async () => {
    const { client, authStore } = await setup({ access: 'alt', accessExpiresAt: Date.now() - 1_000, refresh: 'r1' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(client.send(new Request('http://localhost/api/v1/me'))).rejects.toMatchObject({ code: 'network' });
    expect(authStore.currentAuth().refresh).toBe('r1');
  });

  it('ohne Server wirft sie einen klaren Fehler', async () => {
    const { client, authStore } = await setup({ access: 'a', accessExpiresAt: Date.now() + 600_000, refresh: 'r' });
    await authStore.clearAll();
    await expect(client.send(new Request('http://localhost/api/v1/me'))).rejects.toMatchObject({ code: 'no_server' });
  });
});
