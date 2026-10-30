import { t } from '#lib/i18n/index.svelte.ts';
import { NATIVE } from '#lib/native/flag.ts';

const MAX_SIDE = 2000;

export type Facing = 'user' | 'environment';

export const cameraAvailable = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  window.isSecureContext;

/**
 * Öffnet die Kamera. Wirft, wenn sie fehlt, belegt ist oder der Zugriff verweigert wurde.
 * Klappt der Wunsch nach hoher Auflösung nicht (manche Treiber und Firefox unter Windows stolpern darüber),
 * folgt ein zweiter Versuch ohne Auflösungswunsch. Bei verweigertem Zugriff oder fehlender Kamera ändert der nichts.
 */
export async function startCamera(facing: Facing): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1600 } },
    });
  } catch (first) {
    const problem = cameraProblem(first);
    if (problem === 'denied' || problem === 'missing') throw first;
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

export type CameraProblem = 'denied' | 'busy' | 'missing' | 'other';

/** Ordnet den Fehler von getUserMedia ein, damit die Meldung sagt, was man tun kann. */
export function cameraProblem(error: unknown): CameraProblem {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'missing';
  // Firefox meldet eine von einer anderen App belegte Kamera als NotReadableError oder AbortError
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError')
    return 'busy';
  return 'other';
}

const CAMERA_KEYS = {
  denied: 'camera.denied',
  busy: 'camera.busy',
  missing: 'camera.missing',
  other: 'camera.other',
} as const;

/** Meldung zu einem Kameraproblem in der aktuellen Sprache. In der App heißt "blockiert": Berechtigung in den Handy-Einstellungen. */
export const cameraMessage = (problem: CameraProblem): string =>
  problem === 'denied' && NATIVE ? t('camera.deniedApp') : t(CAMERA_KEYS[problem]);

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9),
  );
}

function scaled(width: number, height: number): { w: number; h: number } {
  const factor = Math.min(1, MAX_SIDE / Math.max(width, height));
  return { w: Math.round(width * factor), h: Math.round(height * factor) };
}

/** Aktuelles Videobild als JPEG (unverspiegelt, höchstens 2000 px). */
export async function frameToJpeg(video: HTMLVideoElement): Promise<Blob> {
  const { w, h } = scaled(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
  return toBlob(canvas);
}

/** Ausgewählte Datei als JPEG verkleinern (Handyfotos sind oft 5 bis 10 MB). Bei Fehlern bleibt die Datei, wie sie ist. */
export async function fileToJpeg(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { w, h } = scaled(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await toBlob(canvas);
  } catch {
    return file;
  }
}

/**
 * App: macht ein Foto mit der Kamera-App des Geräts. Nur der Ausweg, wenn die Live-Kamera nicht läuft
 * (etwa weil die Berechtigung fehlt). Gibt null zurück, wenn die Person abbricht.
 */
export async function takeNativePhoto(): Promise<Blob | null> {
  try {
    // Im Browser (Tests) gibt es keine Gerätekamera; dort bleibt nur die Fotoauswahl
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { Camera } = await import('@capacitor/camera');
    const shot = await Camera.takePhoto({
      quality: 85,
      targetWidth: MAX_SIDE,
      targetHeight: MAX_SIDE,
      correctOrientation: true,
      editable: 'no',
      saveToGallery: false,
    });
    if (!shot.webPath) return null;
    const res = await fetch(shot.webPath);
    return await res.blob();
  } catch {
    return null;
  }
}
