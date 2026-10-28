import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CROCKFORD, encodeBase32 } from '../util/ids.js';

export type TokenPurpose = 'session' | 'access' | 'refresh' | 'invite' | 'email';

/** Zufälliges URL-sicheres Token (Default 256 Bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens liegen nur als Hash in der DB. Der Zweck ist Teil des Hashs (Domain Separation). */
export function hashToken(purpose: TokenPurpose, token: string): string {
  return createHash('sha256').update(`${purpose}:${token}`).digest('hex');
}

/** Zeitkonstanter Stringvergleich, unabhängig von der Länge (beide Seiten werden gehasht). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Einladungscode: 16 Zeichen Crockford-Base32 (80 Bit), dargestellt als XXXX-XXXX-XXXX-XXXX. */
export function generateInviteCode(): string {
  const raw = encodeBase32(randomBytes(10)).slice(0, 16);
  return raw.match(/.{4}/g)!.join('-');
}

const NORMALIZED_CODE = new RegExp(`^[${CROCKFORD}]{16}$`);

/** Toleriert Bindestriche, Leerzeichen, Kleinschreibung und die Verwechslungen O/0 und I,L/1. */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return NORMALIZED_CODE.test(cleaned) ? cleaned : null;
}
