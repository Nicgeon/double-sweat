const MAX_SIDE = 2000;

export type Facing = 'user' | 'environment';

export const cameraAvailable = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  window.isSecureContext;

/** Öffnet die Kamera. Wirft, wenn sie fehlt oder der Zugriff verweigert wurde. */
export async function startCamera(facing: Facing): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1600 } },
  });
}

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
 * App: macht ein Foto mit der Kamera des Geräts (Capacitor Camera). Gibt null zurück, wenn die Person abbricht
 * oder die Erlaubnis verweigert.
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
