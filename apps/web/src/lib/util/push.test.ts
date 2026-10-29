import { beforeEach, describe, expect, it, vi } from 'vitest';

// Die App-Variante: Der Ablauf läuft über push-native, geprüft wird nur, was der Schalter danach zeigt
const native = vi.hoisted(() => ({
  enableNative: vi.fn(),
  disableNative: vi.fn(),
  nativeActive: vi.fn(),
  syncNative: vi.fn(),
}));
vi.mock('#lib/native/flag.ts', () => ({ NATIVE: true, ALLOW_HTTP: false, CLIENT_API: 1 }));
vi.mock('./push-native.ts', () => native);
vi.mock('./push-web.ts', () => ({
  currentSubscription: vi.fn(),
  disablePush: vi.fn(),
  enablePush: vi.fn(),
  webPushSupported: vi.fn(() => false),
  describeAgent: vi.fn(),
  deviceLabel: vi.fn(),
}));

import { pushNote, togglePushState } from './push.ts';

const ntfy = { id: 'io.heckel.ntfy', label: 'ntfy' };
const fcm = { id: 'fcm', label: 'Google (Firebase Cloud Messaging)' };

beforeEach(() => vi.clearAllMocks());

describe('Push-Schalter zeigt den echten Zustand', () => {
  it('direkt eingeschaltet: Schalter an', async () => {
    native.enableNative.mockResolvedValue({ status: 'ok', id: 's1' });
    expect(await togglePushState(true, 'Android-App')).toEqual({
      active: true,
      choices: null,
      note: null,
    });
  });

  it('Auswahl nötig: Schalter bleibt aus, bis gewählt ist, und ist danach an', async () => {
    native.enableNative.mockResolvedValueOnce({ status: 'choose', distributors: [ntfy, fcm] });
    const asked = await togglePushState(true, 'Android-App');
    expect(asked).toEqual({ active: false, choices: [ntfy, fcm], note: null });

    // Die Person tippt auf "Google": derselbe Aufruf mit der Wahl, danach muss der Schalter an sein
    native.enableNative.mockResolvedValueOnce({ status: 'ok', id: 's2' });
    const chosen = await togglePushState(true, 'Android-App', 'fcm');
    expect(native.enableNative).toHaveBeenLastCalledWith('Android-App', 'fcm');
    expect(chosen).toEqual({ active: true, choices: null, note: null });
  });

  it.each(['denied', 'disabled', 'no_distributor', 'unsupported'] as const)(
    '%s: Schalter aus, mit Hinweis',
    async (status) => {
      native.enableNative.mockResolvedValue({ status });
      expect(await togglePushState(true, 'x')).toEqual({
        active: false,
        choices: null,
        note: pushNote(status),
      });
    },
  );

  it('ausgeschaltet: Schalter aus, der Weg wird abgebaut', async () => {
    expect(await togglePushState(false, 'x')).toEqual({ active: false, choices: null, note: null });
    expect(native.disableNative).toHaveBeenCalledOnce();
    expect(native.enableNative).not.toHaveBeenCalled();
  });
});
