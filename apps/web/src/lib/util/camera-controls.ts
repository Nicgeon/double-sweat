/**
 * Fokus, Zoom und Belichtung der Live-Kamera. Android-Chromium (auch in der WebView der App) meldet sie am
 * Video-Track: `getCapabilities()` nennt, was die Kamera kann, `applyConstraints({ advanced })` stellt es ein.
 * Die TypeScript-Typen des Browsers kennen diese Felder nicht, darum stehen sie hier. Alles ist
 * Best-Effort: Was die Kamera nicht meldet (Frontkamera, Desktop, Firefox), wird nie angefragt. Das Anfragen
 * eines nicht gemeldeten Werts würde sogar mit einem Fehler abgelehnt.
 */

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface CameraCaps {
  /** Zoomfaktor (zum Beispiel 1 bis 8), null = kein Zoom */
  zoom: Range | null;
  /** Belichtungskorrektur in Blendenstufen (EV, zum Beispiel -2 bis +2), null = keine */
  exposure: Range | null;
  /** Kontinuierlicher Autofokus ist möglich */
  continuousFocus: boolean;
  /** Fokus auf einen angetippten Punkt ist möglich */
  singleShotFocus: boolean;
  continuousExposure: boolean;
  continuousWhiteBalance: boolean;
}

export const NO_CAPS: CameraCaps = {
  zoom: null,
  exposure: null,
  continuousFocus: false,
  singleShotFocus: false,
  continuousExposure: false,
  continuousWhiteBalance: false,
};

/** Ein Wertebereich, nur wenn er wirklich etwas zu verstellen lässt. */
function range(value: unknown, fallbackStep: number): Range | null {
  if (typeof value !== 'object' || value === null) return null;
  const { min, max, step } = value as Record<string, unknown>;
  if (typeof min !== 'number' || typeof max !== 'number' || !(max > min)) return null;
  return { min, max, step: typeof step === 'number' && step > 0 ? step : fallbackStep };
}

const modes = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** Liest die Fähigkeiten aus dem, was `track.getCapabilities()` liefert. */
export function readCaps(raw: unknown): CameraCaps {
  if (typeof raw !== 'object' || raw === null) return NO_CAPS;
  const c = raw as Record<string, unknown>;
  const focus = modes(c.focusMode);
  return {
    zoom: range(c.zoom, 0.1),
    exposure: range(c.exposureCompensation, 0.1),
    continuousFocus: focus.includes('continuous'),
    singleShotFocus: focus.includes('single-shot'),
    continuousExposure: modes(c.exposureMode).includes('continuous'),
    continuousWhiteBalance: modes(c.whiteBalanceMode).includes('continuous'),
  };
}

/** Gibt es etwas, das sich der Person zum Einstellen anbieten lässt? */
export const hasTools = (caps: CameraCaps): boolean => !!caps.zoom || !!caps.exposure;

/** Wert auf den Bereich begrenzen und auf das Raster des Reglers legen (ohne Fließkomma-Reste wie 2.3000000000000003). */
export function snap(value: number, r: Range): number {
  const clamped = Math.min(r.max, Math.max(r.min, value));
  const snapped = r.min + Math.round((clamped - r.min) / r.step) * r.step;
  return Number(Math.min(r.max, snapped).toFixed(4));
}

/** Zoom beim Spreizen oder Zusammenziehen zweier Finger: der Abstand bestimmt den Faktor gegenüber dem Start. */
export function pinchValue(
  base: number,
  startDistance: number,
  distance: number,
  r: Range,
): number {
  if (!(startDistance > 0) || !(distance > 0)) return snap(base, r);
  return snap((base * distance) / startDistance, r);
}

/**
 * Rechnet eine Berührung auf dem Vorschaubild in den Punkt im Kamerabild um (0 bis 1 von links oben). Das Video füllt
 * die Fläche (`object-fit: cover`), ein Teil des Bildes ist also abgeschnitten; die Frontkamera wird gespiegelt gezeigt,
 * das Kamerabild selbst ist nicht gespiegelt.
 */
export function framePoint(input: {
  box: { left: number; top: number; width: number; height: number };
  video: { width: number; height: number };
  x: number;
  y: number;
  mirrored: boolean;
}): { x: number; y: number } | null {
  const { box, video, mirrored } = input;
  if (!(video.width > 0) || !(video.height > 0) || !(box.width > 0) || !(box.height > 0))
    return null;
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const shownW = video.width * scale;
  const shownH = video.height * scale;
  const fx = (input.x - box.left - (box.width - shownW) / 2) / shownW;
  const fy = (input.y - box.top - (box.height - shownH) / 2) / shownH;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(mirrored ? 1 - fx : fx), y: clamp(fy) };
}

type Entry = Record<string, unknown>;

/** Dauerhaft automatisch: Fokus, Belichtung und Weißabgleich, soweit die Kamera es meldet. */
export function autoEntries(caps: CameraCaps): Entry[] {
  const entries: Entry[] = [];
  if (caps.continuousFocus) entries.push({ focusMode: 'continuous' });
  if (caps.continuousExposure) entries.push({ exposureMode: 'continuous' });
  if (caps.continuousWhiteBalance) entries.push({ whiteBalanceMode: 'continuous' });
  return entries;
}

/** Fokus (und Belichtungsmessung) auf einen Punkt im Kamerabild; null, wenn die Kamera das nicht kann. */
export function focusEntry(caps: CameraCaps, point: { x: number; y: number }): Entry | null {
  const focusMode = caps.singleShotFocus
    ? 'single-shot'
    : caps.continuousFocus
      ? 'continuous'
      : null;
  return focusMode ? { focusMode, pointsOfInterest: [point] } : null;
}

/** So lange bleibt der angetippte Fokus stehen, bevor der Autofokus wieder die Szene verfolgt. */
const REFOCUS_MS = 4000;

/** Stellt die Kamera eines Video-Tracks ein. Fehler der Kamera sind nie ein Grund abzustürzen: dann bleibt es, wie es ist. */
export class TrackControls {
  caps: CameraCaps = NO_CAPS;
  private touched: { zoom?: number; exposureCompensation?: number } = {};
  private busy = false;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private gone = false;

  constructor(private readonly track: MediaStreamTrack) {
    this.refresh();
  }

  /** Fähigkeiten neu lesen (manche Geräte melden sie erst, wenn das Bild läuft). Gibt zurück, ob sich etwas geändert hat. */
  refresh(): boolean {
    let next: CameraCaps;
    try {
      next = readCaps(this.track.getCapabilities?.());
    } catch {
      next = NO_CAPS;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(this.caps);
    this.caps = next;
    return changed;
  }

  /** Verstellte Werte gehören in jede Anfrage: So setzt kein Fokus-Tipp den Zoom zurück. */
  private current(): Entry {
    return { ...this.touched };
  }

  private async apply(entries: Entry[]): Promise<boolean> {
    if (this.gone || entries.length === 0) return false;
    try {
      await this.track.applyConstraints({ advanced: entries } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }

  /** Fokus, Belichtung und Weißabgleich auf automatisch. */
  async applyAuto(): Promise<void> {
    await this.apply(autoEntries(this.caps));
  }

  setZoom(value: number): void {
    if (!this.caps.zoom) return;
    this.touched.zoom = snap(value, this.caps.zoom);
    void this.flush();
  }

  setExposure(value: number): void {
    if (!this.caps.exposure) return;
    this.touched.exposureCompensation = snap(value, this.caps.exposure);
    void this.flush();
  }

  /** Eine Anfrage nach der anderen; beim Ziehen am Regler zählt nur der jüngste Wert. */
  private async flush(): Promise<void> {
    if (this.busy) {
      this.dirty = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.dirty = false;
        await this.apply([this.current()]);
      } while (this.dirty && !this.gone);
    } finally {
      this.busy = false;
    }
  }

  /** Auf einen Punkt scharfstellen. Gibt zurück, ob die Kamera es angenommen hat; danach folgt wieder der Autofokus. */
  async focusAt(point: { x: number; y: number }): Promise<boolean> {
    const entry = focusEntry(this.caps, point);
    if (!entry) return false;
    const ok = await this.apply([{ ...this.current(), ...entry }]);
    clearTimeout(this.timer);
    if (ok && this.caps.singleShotFocus && this.caps.continuousFocus) {
      this.timer = setTimeout(
        () => void this.apply([{ ...this.current(), focusMode: 'continuous' }]),
        REFOCUS_MS,
      );
    }
    return ok;
  }

  dispose(): void {
    this.gone = true;
    clearTimeout(this.timer);
  }
}
