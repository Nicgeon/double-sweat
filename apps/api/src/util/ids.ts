import { randomBytes } from 'node:crypto';

// Crockford-Base32 ohne I, L, O, U
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Kodiert Bytes als Crockford-Base32 (5 Bit pro Zeichen). */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/** Zeitlich sortierbare ID: 10 Zeichen Zeitstempel (ms) + 16 Zeichen Zufall (ULID-Format). */
export function newId(now: number = Date.now()): string {
  let time = now;
  let ts = '';
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[time % 32] + ts;
    time = Math.floor(time / 32);
  }
  return ts + encodeBase32(randomBytes(10));
}
