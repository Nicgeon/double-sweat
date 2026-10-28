import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../util/errors.js';

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 480;
/** Schutz vor Dekompressions-Bomben: größere Bilder werden gar nicht erst dekodiert. */
export const MAX_INPUT_PIXELS = 80_000_000;

export interface ProcessedPhoto {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
}

// Kein Cache und wenig Parallelität: Uploads kommen selten, Speicher soll vorhersagbar bleiben
sharp.cache(false);
sharp.concurrency(1);

/** Erkennt das Format an den ersten Bytes. Der vom Client gesendete Content-Type zählt nicht. */
export function sniffImageType(data: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.subarray(8, 12)) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

// Höchstens zwei Bilder gleichzeitig verarbeiten, der Rest wartet
let active = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/**
 * Prüft und normalisiert ein hochgeladenes Foto: Format per Magic Bytes, Pixel-Limit, EXIF-Orientierung
 * anwenden, auf max. 1600 px verkleinern und als JPEG neu kodieren. Dabei verschwinden alle Metadaten
 * (EXIF, GPS, ICC, Kommentare). Das Neu-Kodieren entfernt außerdem eingebettete Zusatzdaten.
 */
export function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (!sniffImageType(input)) {
    throw new AppError(
      415,
      'unsupported_media_type',
      'Nur JPEG-, PNG- und WebP-Bilder sind erlaubt',
    );
  }
  return withSlot(async () => {
    try {
      const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const meta = await source.metadata();
      if ((meta.pages ?? 1) > 1) {
        throw new AppError(415, 'unsupported_media_type', 'Animierte Bilder sind nicht erlaubt');
      }
      const { data: full, info } = await source
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toBuffer({ resolveWithObject: true });
      const thumb = await sharp(full)
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      return {
        full,
        thumb,
        width: info.width,
        height: info.height,
        sha256: createHash('sha256').update(full).digest('hex'),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : '';
      if (/pixel limit/i.test(message)) {
        throw new AppError(400, 'image_too_large', 'Das Bild hat zu viele Pixel');
      }
      throw new AppError(400, 'invalid_image', 'Das Bild konnte nicht gelesen werden');
    }
  });
}
