import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/client.js';
import { createPasswordHasher } from '../src/security/passwords.js';
import { createRateLimiter, keyPart } from '../src/security/ratelimit.js';
import {
  generateInviteCode,
  hashToken,
  normalizeInviteCode,
  randomToken,
  safeEqual,
} from '../src/security/tokens.js';
import { createFakeClock } from '../src/util/clock.js';
import { encodeBase32, newId } from '../src/util/ids.js';
import { createLogger, redact } from '../src/util/logger.js';

describe('Einladungscodes', () => {
  it('haben 80 Bit Zufall und das Format XXXX-XXXX-XXXX-XXXX', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(new Set(Array.from({ length: 200 }, generateInviteCode)).size).toBe(200);
  });

  it('werden tolerant normalisiert (Kleinschreibung, Leerzeichen, O/0, I/L/1)', () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(code)).toBe(code.replaceAll('-', ''));
    expect(normalizeInviteCode(` ${code.toLowerCase()} `)).toBe(code.replaceAll('-', ''));
    expect(normalizeInviteCode('OOOO-IIII-LLLL-1111')).toBe('0000111111111111');
  });

  it('weisen ungültige Eingaben ab', () => {
    expect(normalizeInviteCode('zu-kurz')).toBeNull();
    expect(normalizeInviteCode('UUUU-UUUU-UUUU-UUUU')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });
});

describe('Tokens', () => {
  it('Hashes sind zweckgebunden (Domain Separation)', () => {
    const t = randomToken();
    expect(hashToken('session', t)).not.toBe(hashToken('access', t));
    expect(hashToken('session', t)).toBe(hashToken('session', t));
    expect(hashToken('session', t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('safeEqual vergleicht inhaltlich und längenunabhängig', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('IDs', () => {
  it('sind zeitlich sortierbar und eindeutig', () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
    expect(newId(5)).not.toBe(newId(5));
  });

  it('Base32 kodiert 5 Bit pro Zeichen', () => {
    expect(encodeBase32(new Uint8Array(10))).toBe('0000000000000000');
    expect(encodeBase32(new Uint8Array(10).fill(255))).toBe('ZZZZZZZZZZZZZZZZ');
  });
});

describe('Passwörter', () => {
  const hasher = createPasswordHasher({ memoryKib: 8192, timeCost: 1, parallelism: 1 });

  it('hasht mit argon2id und prüft korrekt', async () => {
    const hash = await hasher.hash('ein langes passwort');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'ein langes passwort')).toBe(true);
    expect(await hasher.verify(hash, 'falsch')).toBe(false);
    expect(await hasher.verify('kein-hash', 'x')).toBe(false);
  });

  it('erkennt veraltete Parameter für ein Rehash', async () => {
    const weak = await hasher.hash('x'.repeat(12));
    const stronger = createPasswordHasher({ memoryKib: 16384, timeCost: 2, parallelism: 1 });
    expect(hasher.needsRehash(weak)).toBe(false);
    expect(stronger.needsRehash(weak)).toBe(true);
    expect(hasher.needsRehash('$2b$10$irgendwas')).toBe(true);
  });
});

describe('Rate-Limiter', () => {
  const setup = () => {
    const clock = createFakeClock('2026-03-02T10:00:00Z');
    return { clock, limiter: createRateLimiter(openDatabase(':memory:'), clock) };
  };

  it('zählt im Fenster und sperrt oberhalb des Limits', () => {
    const { limiter } = setup();
    expect(limiter.hit('k', 3, 60_000).limited).toBe(false);
    expect(limiter.hit('k', 3, 60_000).limited).toBe(false);
    expect(limiter.hit('k', 3, 60_000).limited).toBe(false);
    const fourth = limiter.hit('k', 3, 60_000);
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterSec).toBe(60);
  });

  it('öffnet nach Ablauf des Fensters wieder', () => {
    const { limiter, clock } = setup();
    for (let i = 0; i < 4; i++) limiter.hit('k', 3, 60_000);
    clock.advance(60_001);
    expect(limiter.hit('k', 3, 60_000)).toMatchObject({ limited: false, count: 1 });
  });

  it('peek zählt nicht, reset löscht', () => {
    const { limiter } = setup();
    limiter.hit('k', 2, 60_000);
    limiter.hit('k', 2, 60_000);
    expect(limiter.peek('k', 2).limited).toBe(true);
    expect(limiter.peek('k', 2).count).toBe(2);
    limiter.reset('k');
    expect(limiter.peek('k', 2)).toMatchObject({ limited: false, count: 0 });
  });

  it('trennt Schlüssel und räumt abgelaufene auf', () => {
    const { limiter, clock } = setup();
    limiter.hit('a', 1, 1_000);
    limiter.hit('b', 1, 60_000);
    clock.advance(2_000);
    expect(limiter.purgeExpired()).toBe(1);
    expect(limiter.peek('b', 1).count).toBe(1);
  });

  it('keyPart verbirgt den Klartext', () => {
    expect(keyPart('anna@example.org')).not.toContain('anna');
    expect(keyPart('a')).toHaveLength(22);
  });
});

describe('Logger', () => {
  it('redigiert sensible Felder', () => {
    expect(
      redact({
        method: 'POST',
        password: 'x',
        Authorization: 'Bearer y',
        email: 'a@b.de',
        status: 200,
      }),
    ).toEqual({
      method: 'POST',
      password: '[redacted]',
      Authorization: '[redacted]',
      email: '[redacted]',
      status: 200,
    });
  });

  it('filtert nach Level', () => {
    const lines: string[] = [];
    const log = createLogger('warn', (l) => lines.push(l));
    log.info('leise');
    log.warn('laut', { token: 'geheim' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"msg":"laut"');
    expect(lines[0]).not.toContain('geheim');
  });
});
