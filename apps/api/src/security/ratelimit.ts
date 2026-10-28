import { createHash } from 'node:crypto';
import type { Db } from '../db/client.js';
import type { Clock } from '../util/clock.js';

export interface RateLimitResult {
  limited: boolean;
  count: number;
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Zählt einen Versuch. limited ist true, sobald count > limit. */
  hit(key: string, limit: number, windowMs: number): RateLimitResult;
  /** Liest nur, ohne zu zählen. limited ist true, sobald count >= limit. */
  peek(key: string, limit: number): RateLimitResult;
  reset(key: string): void;
  purgeExpired(): number;
}

/** Kürzt personenbezogene Schlüsselteile (z. B. E-Mail-Adressen), damit sie nicht im Klartext in der DB stehen. */
export function keyPart(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 22);
}

/** Fixed-Window-Limiter in SQLite: überlebt Neustarts und ist atomar (ein Statement pro Zähler). */
export function createRateLimiter(db: Db, clock: Clock): RateLimiter {
  const sqlite = db.$client;
  const hitStmt = sqlite.prepare(`
    INSERT INTO rate_limits (key, window_start, count, expires_at)
    VALUES (@key, @now, 1, @now + @window)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at <= @now THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.expires_at <= @now THEN @now ELSE rate_limits.window_start END,
      expires_at = CASE WHEN rate_limits.expires_at <= @now THEN @now + @window ELSE rate_limits.expires_at END
    RETURNING count, expires_at
  `);
  const peekStmt = sqlite.prepare(
    'SELECT count, expires_at FROM rate_limits WHERE key = ? AND expires_at > ?',
  );
  const resetStmt = sqlite.prepare('DELETE FROM rate_limits WHERE key = ?');
  const purgeStmt = sqlite.prepare('DELETE FROM rate_limits WHERE expires_at <= ?');

  const result = (
    count: number,
    expiresAt: number,
    limited: boolean,
    now: number,
  ): RateLimitResult => ({
    limited,
    count,
    retryAfterSec: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
  });

  return {
    hit(key, limit, windowMs) {
      const now = clock.now();
      const row = hitStmt.get({ key, now, window: windowMs }) as {
        count: number;
        expires_at: number;
      };
      return result(row.count, row.expires_at, row.count > limit, now);
    },
    peek(key, limit) {
      const now = clock.now();
      const row = peekStmt.get(key, now) as { count: number; expires_at: number } | undefined;
      if (!row) return { limited: false, count: 0, retryAfterSec: 0 };
      return result(row.count, row.expires_at, row.count >= limit, now);
    },
    reset(key) {
      resetStmt.run(key);
    },
    purgeExpired() {
      return purgeStmt.run(clock.now()).changes;
    },
  };
}
