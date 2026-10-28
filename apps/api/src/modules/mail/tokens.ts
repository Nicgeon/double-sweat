import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { DbLike } from '../../db/client.js';
import { type EmailTokenRow, emailTokens } from '../../db/schema.js';
import { hashToken, randomToken } from '../../security/tokens.js';
import { newId } from '../../util/ids.js';
import { HOUR, MINUTE, SECOND } from '../../util/time.js';

export type EmailTokenKind = EmailTokenRow['kind'];

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenKind, number> = {
  verify: 24 * HOUR,
  reset: 30 * MINUTE,
  email_change: 24 * HOUR,
  // Download-Berechtigung des Datenexports, bewusst nur 60 Sekunden gültig
  export: 60 * SECOND,
};

/** Erzeugt ein Einmal-Token. Nur der Hash wird gespeichert; ältere offene Tokens gleicher Art verfallen. */
export function createEmailToken(
  db: DbLike,
  now: number,
  userId: string,
  kind: EmailTokenKind,
  newEmail?: string,
): string {
  const token = randomToken(32);
  db.delete(emailTokens)
    .where(
      and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)),
    )
    .run();
  db.insert(emailTokens)
    .values({
      id: newId(now),
      userId,
      kind,
      tokenHash: hashToken('email', token),
      newEmail: newEmail ?? null,
      createdAt: now,
      expiresAt: now + EMAIL_TOKEN_TTL_MS[kind],
    })
    .run();
  return token;
}

/** Prüft nur, ob ein Token gültig wäre, ohne es zu verbrauchen. */
export function peekEmailToken(
  db: DbLike,
  now: number,
  token: string,
  kinds: EmailTokenKind[],
): boolean {
  return !!db
    .select({ id: emailTokens.id })
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken('email', token)),
        inArray(emailTokens.kind, kinds),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
      ),
    )
    .get();
}

/** Verbraucht ein Token atomar (ein Statement). Gibt null zurück, wenn es ungültig, abgelaufen oder benutzt ist. */
export function consumeEmailToken(
  db: DbLike,
  now: number,
  token: string,
  kinds: EmailTokenKind[],
): EmailTokenRow | null {
  return (
    db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken('email', token)),
          inArray(emailTokens.kind, kinds),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning()
      .get() ?? null
  );
}
