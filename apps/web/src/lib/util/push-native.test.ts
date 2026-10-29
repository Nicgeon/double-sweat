import { beforeEach, describe, expect, it, vi } from 'vitest';

// Attrappen der Plugins und des API-Clients: geprüft wird nur der Ablauf
const store = new Map<string, string>();
const plugins = vi.hoisted(() => ({
  SecureStore: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  UnifiedPush: {
    requestNotificationPermission: vi.fn(),
    getDistributors: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    current: vi.fn(),
  },
  Fcm: {
    isAvailable: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    current: vi.fn(),
  },
}));
const client = vi.hoisted(() => ({
  api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
  unwrap: (x: unknown) => x,
}));
vi.mock('#lib/native/plugins.ts', () => plugins);
vi.mock('#lib/api/client.ts', () => client);

import {
  disableNative,
  enableNative,
  fcmChoice,
  nativeActive,
  planPush,
  syncNative,
} from './push-native.ts';

const ntfy = { id: 'io.heckel.ntfy', label: 'ntfy' };
const other = { id: 'org.example.up', label: 'Andere' };
const reg = { endpoint: 'https://ntfy.example/up123', p256dh: 'pk', auth: 'au' };
const fcmReg = { endpoint: 'fcm-token-1', p256dh: 'pk2', auth: 'au2' };

describe('planPush: UnifiedPush zuerst, FCM nur wo es passt', () => {
  const base = { distributors: [], savedDistributor: null, unifiedEnabled: true, fcmUsable: false };

  it('ohne Verteiler und ohne FCM: es fehlt ein Verteiler', () => {
    expect(planPush(base)).toEqual({ kind: 'none', reason: 'no_distributor' });
  });
  it('ohne Verteiler, aber mit FCM: FCM, ohne Rückfrage', () => {
    expect(planPush({ ...base, fcmUsable: true })).toEqual({ kind: 'fcm' });
  });
  it('ein Verteiler und kein FCM: UnifiedPush wie bisher', () => {
    expect(planPush({ ...base, distributors: [ntfy] })).toEqual({
      kind: 'unified',
      distributor: ntfy.id,
    });
  });
  it('mehrere Verteiler und kein FCM: Auswahl', () => {
    expect(planPush({ ...base, distributors: [ntfy, other] })).toEqual({
      kind: 'choose',
      options: [ntfy, other],
    });
  });
  it('Verteiler und FCM möglich: Auswahl mit FCM am Ende', () => {
    expect(planPush({ ...base, distributors: [ntfy], fcmUsable: true })).toEqual({
      kind: 'choose',
      options: [ntfy, fcmChoice()],
    });
  });
  it('ein früher gewählter Verteiler wird wieder genommen', () => {
    expect(
      planPush({
        ...base,
        distributors: [ntfy, other],
        savedDistributor: other.id,
        fcmUsable: true,
      }),
    ).toEqual({ kind: 'unified', distributor: other.id });
  });
  it('ausdrückliche Wahl gilt; unbekannte Verteiler und nicht nutzbares FCM nicht', () => {
    expect(planPush({ ...base, distributors: [ntfy], requested: 'fcm', fcmUsable: true })).toEqual({
      kind: 'fcm',
    });
    expect(planPush({ ...base, distributors: [ntfy], requested: 'fcm' })).toEqual({
      kind: 'none',
      reason: 'disabled',
    });
    expect(planPush({ ...base, distributors: [ntfy], requested: ntfy.id })).toEqual({
      kind: 'unified',
      distributor: ntfy.id,
    });
    expect(planPush({ ...base, distributors: [ntfy], requested: 'evil.app' })).toEqual({
      kind: 'none',
      reason: 'no_distributor',
    });
  });
  it('UnifiedPush am Server aus: nur FCM bleibt, sonst "abgeschaltet"', () => {
    const off = { ...base, distributors: [ntfy], unifiedEnabled: false };
    expect(planPush({ ...off, fcmUsable: true })).toEqual({ kind: 'fcm' });
    expect(planPush(off)).toEqual({ kind: 'none', reason: 'disabled' });
  });
});

function setup(opts: { fcm?: boolean; serverFcm?: boolean; distributors?: unknown[] } = {}) {
  store.clear();
  vi.clearAllMocks();
  plugins.SecureStore.get.mockImplementation(async ({ key }: { key: string }) => ({
    value: store.get(key) ?? null,
  }));
  plugins.SecureStore.set.mockImplementation(
    async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    },
  );
  plugins.SecureStore.remove.mockImplementation(async ({ key }: { key: string }) => {
    store.delete(key);
  });
  plugins.UnifiedPush.requestNotificationPermission.mockResolvedValue({ granted: true });
  plugins.UnifiedPush.getDistributors.mockResolvedValue({
    distributors: opts.distributors ?? [],
    current: null,
  });
  plugins.UnifiedPush.register.mockResolvedValue(reg);
  plugins.UnifiedPush.current.mockResolvedValue({ registration: reg });
  plugins.Fcm.isAvailable.mockResolvedValue({ available: opts.fcm ?? true });
  plugins.Fcm.register.mockResolvedValue(fcmReg);
  plugins.Fcm.current.mockResolvedValue({ registration: fcmReg });
  client.api.GET.mockResolvedValue({
    unifiedpush: { enabled: true },
    fcm: { enabled: opts.serverFcm ?? true },
  });
  client.api.POST.mockResolvedValue({ subscription: { id: 'sub-1' } });
  client.api.DELETE.mockResolvedValue({ ok: true });
}

describe('Push einschalten', () => {
  beforeEach(() => setup());

  it('ohne Verteiler, mit FCM: meldet das Token samt Schlüsseln als fcm an', async () => {
    const res = await enableNative('Android-App');
    expect(res).toEqual({ status: 'ok', id: 'sub-1' });
    expect(plugins.Fcm.register).toHaveBeenCalled();
    expect(plugins.UnifiedPush.register).not.toHaveBeenCalled();
    expect(client.api.POST).toHaveBeenCalledWith('/api/v1/push/subscriptions', {
      body: {
        provider: 'fcm',
        endpoint: 'fcm-token-1',
        keys: { p256dh: 'pk2', auth: 'au2' },
        deviceLabel: 'Android-App',
      },
    });
    expect(JSON.parse(store.get('push_subscription') ?? '{}')).toEqual({
      id: 'sub-1',
      endpoint: 'fcm-token-1',
      provider: 'fcm',
    });
  });

  it('FCM am Server aus oder ohne Google-Dienste: nicht nutzbar, kein Token angefragt', async () => {
    setup({ serverFcm: false });
    expect(await enableNative('x')).toEqual({ status: 'no_distributor' });
    setup({ fcm: false });
    expect(await enableNative('x')).toEqual({ status: 'no_distributor' });
    expect(plugins.Fcm.register).not.toHaveBeenCalled();
  });

  it('Verteiler und FCM möglich: erst fragen, dann mit der Wahl einrichten', async () => {
    setup({ distributors: [ntfy] });
    const asked = await enableNative('x');
    expect(asked).toEqual({ status: 'choose', distributors: [ntfy, fcmChoice()] });
    expect(plugins.Fcm.register).not.toHaveBeenCalled();
    expect(plugins.UnifiedPush.register).not.toHaveBeenCalled();

    expect(await enableNative('x', 'fcm')).toMatchObject({ status: 'ok' });
    expect(plugins.Fcm.register).toHaveBeenCalledOnce();
  });

  it('Verteiler gewählt: UnifiedPush, die Schlüssel sind optional', async () => {
    setup({ distributors: [ntfy] });
    plugins.UnifiedPush.register.mockResolvedValue({ endpoint: 'https://ntfy.example/x' });
    await enableNative('x', ntfy.id);
    expect(client.api.POST).toHaveBeenCalledWith('/api/v1/push/subscriptions', {
      body: {
        provider: 'unifiedpush',
        endpoint: 'https://ntfy.example/x',
        keys: undefined,
        deviceLabel: 'x',
      },
    });
  });

  it('abgelehnte Benachrichtigungs-Erlaubnis: nichts wird angefragt', async () => {
    plugins.UnifiedPush.requestNotificationPermission.mockResolvedValue({ granted: false });
    expect(await enableNative('x')).toEqual({ status: 'denied' });
    expect(client.api.GET).not.toHaveBeenCalled();
  });

  it('Wechsel von FCM zu UnifiedPush baut die alte Anmeldung ab', async () => {
    await enableNative('x'); // FCM
    setup({ distributors: [ntfy] });
    store.set(
      'push_subscription',
      JSON.stringify({ id: 'sub-old', endpoint: 'fcm-token-1', provider: 'fcm' }),
    );
    await enableNative('x', ntfy.id);
    expect(client.api.DELETE).toHaveBeenCalledWith('/api/v1/push/subscriptions/{id}', {
      params: { path: { id: 'sub-old' } },
    });
    expect(plugins.Fcm.unregister).toHaveBeenCalled();
    expect(JSON.parse(store.get('push_subscription') ?? '{}').provider).toBe('unifiedpush');
  });
});

describe('Push abschalten, abgleichen, Zustand', () => {
  beforeEach(() => setup());

  it('abschalten räumt Server, Plugin und Speicher auf, nur beim passenden Weg', async () => {
    store.set(
      'push_subscription',
      JSON.stringify({ id: 'sub-1', endpoint: 'fcm-token-1', provider: 'fcm' }),
    );
    await disableNative();
    expect(client.api.DELETE).toHaveBeenCalledOnce();
    expect(plugins.Fcm.unregister).toHaveBeenCalled();
    expect(plugins.UnifiedPush.unregister).not.toHaveBeenCalled();
    expect(store.has('push_subscription')).toBe(false);
  });

  it('Einträge ohne Angabe des Weges stammen aus der Zeit mit nur UnifiedPush', async () => {
    store.set('push_subscription', JSON.stringify({ id: 'sub-1', endpoint: reg.endpoint }));
    expect(await nativeActive()).toBe(true);
    await disableNative();
    expect(plugins.UnifiedPush.unregister).toHaveBeenCalled();
    expect(plugins.Fcm.unregister).not.toHaveBeenCalled();
  });

  it('Abschalten funktioniert auch, wenn der Server das Gerät nicht mehr kennt', async () => {
    store.set('push_subscription', JSON.stringify({ id: 'sub-1', endpoint: 'x', provider: 'fcm' }));
    client.api.DELETE.mockRejectedValue(new Error('404'));
    await expect(disableNative()).resolves.toBeUndefined();
    expect(store.has('push_subscription')).toBe(false);
  });

  it('ein neues FCM-Token wird beim Start dem Server gemeldet, das alte entfernt', async () => {
    store.set(
      'push_subscription',
      JSON.stringify({ id: 'sub-old', endpoint: 'fcm-token-OLD', provider: 'fcm' }),
    );
    await syncNative('Android-App');
    expect(client.api.POST).toHaveBeenCalledWith(
      '/api/v1/push/subscriptions',
      expect.objectContaining({
        body: expect.objectContaining({ provider: 'fcm', endpoint: 'fcm-token-1' }),
      }),
    );
    expect(client.api.DELETE).toHaveBeenCalledWith('/api/v1/push/subscriptions/{id}', {
      params: { path: { id: 'sub-old' } },
    });
    expect(JSON.parse(store.get('push_subscription') ?? '{}')).toMatchObject({
      id: 'sub-1',
      endpoint: 'fcm-token-1',
    });
  });

  it('unveränderter Endpunkt und fehlende Anmeldung lösen nichts aus', async () => {
    await syncNative('x');
    store.set(
      'push_subscription',
      JSON.stringify({ id: 's', endpoint: 'fcm-token-1', provider: 'fcm' }),
    );
    await syncNative('x');
    expect(client.api.POST).not.toHaveBeenCalled();
    plugins.Fcm.current.mockResolvedValue({ registration: null });
    expect(await nativeActive()).toBe(false);
  });
});
