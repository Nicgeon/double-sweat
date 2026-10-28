import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { type AppTokenRow, appTokens, type User, users } from '../../db/schema.js';
import { hashToken, randomToken } from '../../security/tokens.js';
import { AppError } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { DAY, MINUTE } from '../../util/time.js';

export const ACCESS_TOKEN_MS = 15 * MINUTE;
export const REFRESH_TOKEN_MS = 30 * DAY;
const TOUCH_INTERVAL_MS = MINUTE;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Gültigkeit des Access-Tokens in Sekunden. */
  expiresIn: number;
  refreshExpiresAt: number;
}

function insertPair(
  db: DbLike,
  ctx: AppContext,
  userId: string,
  familyId: string,
  deviceLabel: string | null,
): TokenPair {
  const now = ctx.clock.now();
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  db.insert(appTokens)
    .values({
      id: newId(now),
      familyId,
      userId,
      accessHash: hashToken('access', accessToken),
      refreshHash: hashToken('refresh', refreshToken),
      deviceLabel,
      createdAt: now,
      lastUsedAt: now,
      accessExpires: now + ACCESS_TOKEN_MS,
      refreshExpires: now + REFRESH_TOKEN_MS,
    })
    .run();
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_MS / 1000),
    refreshExpiresAt: now + REFRESH_TOKEN_MS,
  };
}

/** Stellt ein neues Token-Paar für ein Gerät aus (neue Familie). */
export function issueTokenPair(
  ctx: AppContext,
  userId: string,
  deviceLabel: string | undefined,
): TokenPair & { familyId: string } {
  const familyId = newId(ctx.clock.now());
  const pair = insertPair(ctx.db, ctx, userId, familyId, deviceLabel?.slice(0, 80) ?? null);
  return { ...pair, familyId };
}

export function lookupAccessToken(
  ctx: AppContext,
  token: string,
): { row: AppTokenRow; user: User } | null {
  const now = ctx.clock.now();
  const found = ctx.db
    .select({ row: appTokens, user: users })
    .from(appTokens)
    .innerJoin(users, eq(users.id, appTokens.userId))
    .where(
      and(
        eq(appTokens.accessHash, hashToken('access', token)),
        gt(appTokens.accessExpires, now),
        isNull(appTokens.revokedAt),
        isNull(appTokens.rotatedAt),
      ),
    )
    .get();
  if (!found) return null;
  if (now - found.row.lastUsedAt > TOUCH_INTERVAL_MS) {
    ctx.db.update(appTokens).set({ lastUsedAt: now }).where(eq(appTokens.id, found.row.id)).run();
  }
  return found;
}

type RefreshOutcome =
  | { kind: 'ok'; pair: TokenPair & { familyId: string }; user: User }
  | { kind: 'invalid' }
  | { kind: 'reuse' };

/**
 * Rotiert ein Refresh-Token. Wird ein bereits rotiertes Token erneut vorgelegt, deutet das auf Diebstahl
 * hin: Die gesamte Token-Familie (alle Geräte-Tokens dieser Anmeldung) wird widerrufen.
 */
export function refreshTokenPair(
  ctx: AppContext,
  refreshToken: string,
): TokenPair & { familyId: string; user: User } {
  const now = ctx.clock.now();
  const outcome = ctx.db.transaction(
    (tx): RefreshOutcome => {
      const row = tx
        .select()
        .from(appTokens)
        .where(eq(appTokens.refreshHash, hashToken('refresh', refreshToken)))
        .get();
      if (!row || row.revokedAt || row.refreshExpires <= now) return { kind: 'invalid' };
      if (row.rotatedAt) {
        tx.update(appTokens)
          .set({ revokedAt: now })
          .where(and(eq(appTokens.familyId, row.familyId), isNull(appTokens.revokedAt)))
          .run();
        return { kind: 'reuse' };
      }
      const user = tx.select().from(users).where(eq(users.id, row.userId)).get();
      if (!user) return { kind: 'invalid' };
      tx.update(appTokens).set({ rotatedAt: now }).where(eq(appTokens.id, row.id)).run();
      const pair = insertPair(tx, ctx, row.userId, row.familyId, row.deviceLabel);
      return { kind: 'ok', pair: { ...pair, familyId: row.familyId }, user };
    },
    { behavior: 'immediate' },
  );

  if (outcome.kind === 'reuse') {
    ctx.log.warn('refresh_token_reuse_detected');
    throw new AppError(401, 'refresh_reuse', 'Anmeldung ungültig, bitte erneut anmelden');
  }
  if (outcome.kind === 'invalid')
    throw new AppError(401, 'invalid_refresh', 'Anmeldung ungültig, bitte erneut anmelden');
  return { ...outcome.pair, user: outcome.user };
}

export function revokeFamily(ctx: AppContext, familyId: string, userId: string): boolean {
  const now = ctx.clock.now();
  return (
    ctx.db
      .update(appTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appTokens.familyId, familyId),
          eq(appTokens.userId, userId),
          isNull(appTokens.revokedAt),
        ),
      )
      .run().changes > 0
  );
}

/** Widerruft alle App-Anmeldungen eines Nutzers, optional bis auf eine Familie. */
export function revokeAllFamilies(
  db: DbLike,
  now: number,
  userId: string,
  exceptFamilyId?: string,
): void {
  const where = exceptFamilyId
    ? and(
        eq(appTokens.userId, userId),
        isNull(appTokens.revokedAt),
        ne(appTokens.familyId, exceptFamilyId),
      )
    : and(eq(appTokens.userId, userId), isNull(appTokens.revokedAt));
  db.update(appTokens).set({ revokedAt: now }).where(where).run();
}
