import { describe, expect, it, vi } from 'vitest';
import {
  autoEntries,
  focusEntry,
  framePoint,
  hasTools,
  NO_CAPS,
  pinchValue,
  readCaps,
  snap,
  TrackControls,
} from './camera-controls.ts';

/** So meldet ein Android-Handy seine Rückkamera (Chromium). */
const PHONE = {
  zoom: { min: 1, max: 8, step: 0.1 },
  exposureCompensation: { min: -3, max: 3, step: 0.5 },
  focusMode: ['manual', 'single-shot', 'continuous'],
  exposureMode: ['manual', 'continuous'],
  whiteBalanceMode: ['manual', 'continuous'],
};

describe('readCaps', () => {
  it('liest Zoom, Belichtung und Modi', () => {
    expect(readCaps(PHONE)).toEqual({
      zoom: { min: 1, max: 8, step: 0.1 },
      exposure: { min: -3, max: 3, step: 0.5 },
      continuousFocus: true,
      singleShotFocus: true,
      continuousExposure: true,
      continuousWhiteBalance: true,
    });
  });

  it('ein Gerät ohne diese Felder (Desktop, Frontkamera) bietet nichts an', () => {
    expect(readCaps({ width: { min: 1, max: 3840 }, facingMode: [] })).toEqual(NO_CAPS);
    expect(readCaps(undefined)).toEqual(NO_CAPS);
    expect(readCaps('kaputt')).toEqual(NO_CAPS);
    expect(hasTools(readCaps({}))).toBe(false);
  });

  it('der Fake-Kamera von Chromium fehlen Zoom und Belichtungskorrektur, Fokus und Belichtung sind nur manuell oder kontinuierlich', () => {
    const caps = readCaps({
      exposureMode: ['manual', 'continuous'],
      exposureTime: { min: 10, max: 100, step: 5 },
      focusMode: ['manual', 'continuous'],
    });
    expect(caps.zoom).toBeNull();
    expect(caps.exposure).toBeNull();
    expect(caps.continuousFocus).toBe(true);
    expect(caps.singleShotFocus).toBe(false);
    expect(hasTools(caps)).toBe(false);
  });

  it('ein Bereich ohne Spielraum oder ohne Schrittweite ist kein Regler', () => {
    expect(readCaps({ zoom: { min: 1, max: 1, step: 0.1 } }).zoom).toBeNull();
    expect(readCaps({ zoom: { min: 1, max: 4 } }).zoom).toEqual({ min: 1, max: 4, step: 0.1 });
    expect(readCaps({ zoom: { min: 1, max: 4, step: 0 } }).zoom?.step).toBe(0.1);
    expect(readCaps({ zoom: 'viel' }).zoom).toBeNull();
  });
});

describe('snap und pinchValue', () => {
  const zoom = { min: 1, max: 8, step: 0.1 };

  it('begrenzt auf den Bereich und legt auf das Raster', () => {
    expect(snap(0.2, zoom)).toBe(1);
    expect(snap(20, zoom)).toBe(8);
    expect(snap(2.34, zoom)).toBe(2.3);
    expect(snap(2.36, zoom)).toBe(2.4);
    expect(snap(0.74, { min: -3, max: 3, step: 0.5 })).toBe(0.5);
  });

  it('Spreizen zoomt hinein, Zusammenziehen heraus, nie über den Bereich', () => {
    expect(pinchValue(1, 100, 200, zoom)).toBe(2);
    expect(pinchValue(4, 200, 100, zoom)).toBe(2);
    expect(pinchValue(4, 100, 1000, zoom)).toBe(8);
    expect(pinchValue(2, 100, 10, zoom)).toBe(1);
  });

  it('ein unbrauchbarer Abstand lässt den Zoom, wie er ist', () => {
    expect(pinchValue(3, 0, 120, zoom)).toBe(3);
    expect(pinchValue(3, 120, 0, zoom)).toBe(3);
  });
});

describe('framePoint', () => {
  // Fläche 400 × 800 (Handy), Kamerabild 1600 × 1200 (quer): es wird zugeschnitten, links und rechts fehlt etwas
  const box = { left: 0, top: 0, width: 400, height: 800 };
  const video = { width: 1600, height: 1200 };

  it('die Mitte der Fläche ist die Mitte des Bildes', () => {
    expect(framePoint({ box, video, x: 200, y: 400, mirrored: false })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('berücksichtigt den abgeschnittenen Rand: der linke Rand der Fläche liegt im Bild nicht bei 0', () => {
    // Bild wird auf 1066,7 × 800 skaliert, links und rechts sind je 333,3 px abgeschnitten
    const p = framePoint({ box, video, x: 0, y: 0, mirrored: false });
    expect(p?.x).toBeCloseTo(333.33 / 1066.67, 3);
    expect(p?.y).toBe(0);
  });

  it('die gespiegelte Frontkamera dreht links und rechts um', () => {
    const p = framePoint({ box, video, x: 100, y: 400, mirrored: false });
    const m = framePoint({ box, video, x: 100, y: 400, mirrored: true });
    expect(p && m && p.x + m.x).toBeCloseTo(1, 5);
  });

  it('rechnet die Lage der Fläche auf der Seite mit', () => {
    const p = framePoint({
      box: { left: 50, top: 100, width: 400, height: 800 },
      video,
      x: 250,
      y: 500,
      mirrored: false,
    });
    expect(p).toEqual({ x: 0.5, y: 0.5 });
  });

  it('ohne Bild oder Fläche kein Punkt', () => {
    expect(
      framePoint({ box, video: { width: 0, height: 0 }, x: 1, y: 1, mirrored: false }),
    ).toBeNull();
    expect(
      framePoint({
        box: { left: 0, top: 0, width: 0, height: 0 },
        video,
        x: 1,
        y: 1,
        mirrored: false,
      }),
    ).toBeNull();
  });
});

describe('autoEntries und focusEntry', () => {
  it('stellt nur auf automatisch, was die Kamera meldet', () => {
    expect(autoEntries(readCaps(PHONE))).toEqual([
      { focusMode: 'continuous' },
      { exposureMode: 'continuous' },
      { whiteBalanceMode: 'continuous' },
    ]);
    expect(autoEntries(NO_CAPS)).toEqual([]);
    expect(autoEntries(readCaps({ focusMode: ['manual'] }))).toEqual([]);
  });

  it('Tipp auf das Bild: Fokus auf den Punkt, ohne Einzelfokus mit dem Dauerfokus', () => {
    const point = { x: 0.3, y: 0.7 };
    expect(focusEntry(readCaps(PHONE), point)).toEqual({
      focusMode: 'single-shot',
      pointsOfInterest: [point],
    });
    expect(focusEntry(readCaps({ focusMode: ['continuous'] }), point)).toEqual({
      focusMode: 'continuous',
      pointsOfInterest: [point],
    });
    expect(focusEntry(NO_CAPS, point)).toBeNull();
  });
});

/** Ein Video-Track, der anfragt, was er bekommt. */
function fakeTrack(raw: unknown, fail = false) {
  const calls: unknown[] = [];
  const track = {
    getCapabilities: () => raw,
    applyConstraints: vi.fn(async (c: unknown) => {
      calls.push(c);
      if (fail) throw new Error('OverconstrainedError');
    }),
  };
  return { track: track as unknown as MediaStreamTrack, calls };
}

describe('TrackControls', () => {
  it('Zoom und Belichtung werden gerastert angefragt, jede Anfrage trägt die schon verstellten Werte', async () => {
    const { track, calls } = fakeTrack(PHONE);
    const c = new TrackControls(track);
    c.setZoom(2.34);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ advanced: [{ zoom: 2.3 }] });
    c.setExposure(1.2);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ advanced: [{ zoom: 2.3, exposureCompensation: 1 }] });
  });

  it('beim schnellen Ziehen zählt der jüngste Wert, es läuft immer nur eine Anfrage', async () => {
    const { track, calls } = fakeTrack(PHONE);
    const c = new TrackControls(track);
    for (const z of [1.5, 2, 2.5, 3, 3.5]) c.setZoom(z);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.at(-1)).toEqual({ advanced: [{ zoom: 3.5 }] });
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('fragt nichts an, was die Kamera nicht meldet', async () => {
    const { track, calls } = fakeTrack({ focusMode: ['continuous'] });
    const c = new TrackControls(track);
    c.setZoom(2);
    c.setExposure(1);
    expect(await c.focusAt({ x: 0.5, y: 0.5 })).toBe(true); // Dauerfokus auf den Punkt
    await c.applyAuto();
    expect(JSON.stringify(calls)).not.toContain('zoom');
    expect(JSON.stringify(calls)).not.toContain('exposureCompensation');
  });

  it('eine abgelehnte Anfrage ist kein Fehler der App', async () => {
    const { track } = fakeTrack(PHONE, true);
    const c = new TrackControls(track);
    await expect(c.applyAuto()).resolves.toBeUndefined();
    expect(await c.focusAt({ x: 0.1, y: 0.1 })).toBe(false);
    expect(() => c.setZoom(3)).not.toThrow();
  });

  it('ein Track, der keine Fähigkeiten melden kann, bietet nichts an', () => {
    const c = new TrackControls({} as MediaStreamTrack);
    expect(c.caps).toEqual(NO_CAPS);
  });

  it('refresh meldet, ob sich die Fähigkeiten geändert haben (manche Geräte melden sie erst bei laufendem Bild)', () => {
    let raw: unknown = {};
    const c = new TrackControls({ getCapabilities: () => raw } as unknown as MediaStreamTrack);
    expect(c.refresh()).toBe(false);
    raw = PHONE;
    expect(c.refresh()).toBe(true);
    expect(c.refresh()).toBe(false);
    expect(c.caps.zoom).not.toBeNull();
  });

  it('nach dem Aufräumen wird nichts mehr angefragt', async () => {
    const { track, calls } = fakeTrack(PHONE);
    const c = new TrackControls(track);
    c.dispose();
    await c.applyAuto();
    c.setZoom(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual([]);
  });
});
