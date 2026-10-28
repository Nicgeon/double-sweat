import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

/** Zufallsrauschen als JPEG: Jedes Bild ist anders (wichtig wegen der Duplikat-Erkennung). */
export async function noisyJpeg(width = 320, height = 240): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export const MARKERS = { description: 'Standort Berlin Mitte', copyright: 'geheim-urheber' };

/** JPEG mit EXIF-Orientierung (90° gedreht), Textmarkern und GPS-Koordinaten. */
export async function jpegWithExif(width = 200, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { ImageDescription: MARKERS.description, Copyright: MARKERS.copyright },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '52/1 31/1 12/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '13/1 24/1 18/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

export async function pngImage(width = 120, height = 90): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

export async function webpImage(width = 120, height = 90): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .webp()
    .toBuffer();
}

/** Echtes PNG mit mehr als 80 Mio. Pixeln: kleine Datei, riesiges Bild (Dekompressions-Bombe). */
export async function pixelBombPng(): Promise<Buffer> {
  return sharp({ create: { width: 9100, height: 9100, channels: 3, background: '#000' } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function photoForm(
  photo: Buffer,
  fields: Record<string, string> = {},
  filename = 'foto.jpg',
  type = 'image/jpeg',
) {
  const form = new FormData();
  form.set('photo', new File([new Uint8Array(photo)], filename, { type }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
