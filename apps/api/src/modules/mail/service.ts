import { eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { type User, users } from '../../db/schema.js';
import { keyPart } from '../../security/ratelimit.js';
import { badRequest, conflict, tooManyRequests } from '../../util/errors.js';
import { HOUR } from '../../util/time.js';
import { revokeAllFamilies } from '../auth/app-tokens.js';
import { normalizeEmail, sendVerification, verifyReauth } from '../auth/service.js';
import { deleteAllSessions } from '../auth/sessions.js';
import { linkTo, sendMailInBackground } from './send.js';
import {
  emailChangeConfirmMail,
  emailChangedNoticeMail,
  passwordChangedMail,
  passwordResetMail,
} from './templates.js';
import { consumeEmailToken, createEmailToken, peekEmailToken } from './tokens.js';

const INVALID_TOKEN = 'Der Link ist ungültig oder abgelaufen';

/**
 * "Passwort vergessen". Die Antwort ist immer dieselbe, egal ob die Adresse existiert oder bestätigt ist.
 * Suche, Token und Versand laufen nach der Antwort im Hintergrund (kein Timing-Unterschied).
 * Nur bestätigte Adressen bekommen einen Link.
 */
export function requestPasswordReset(ctx: AppContext, ip: string, emailRaw: string): void {
  const email = normalizeEmail(emailRaw);
  const byIp = ctx.limiter.hit(`forgot:ip:${ip}`, 10, HOUR);
  if (byIp.limited) throw tooManyRequests(byIp.retryAfterSec);
  const byEmail = ctx.limiter.hit(`forgot:email:${keyPart(email)}`, 3, HOUR);
  if (byEmail.limited) throw tooManyRequests(byEmail.retryAfterSec);

  ctx.defer(() => {
    const user = ctx.db.select().from(users).where(eq(users.email, email)).get();
    if (!user || user.emailVerifiedAt === null) return;
    const token = createEmailToken(ctx.db, ctx.clock.now(), user.id, 'reset');
    sendMailInBackground(
      ctx,
      'reset',
      passwordResetMail(user.email, user.displayName, linkTo(ctx, 'reset', token)),
    );
  });
}

/** Setzt das Passwort mit einem Reset-Token (E-Mail-Link oder CLI). Beendet alle Sitzungen und App-Anmeldungen. */
export async function resetPassword(
  ctx: AppContext,
  ip: string,
  token: string,
  newPassword: string,
): Promise<void> {
  const limit = ctx.limiter.hit(`reset:ip:${ip}`, 20, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  if (!peekEmailToken(ctx.db, ctx.clock.now(), token, ['reset']))
    throw badRequest('invalid_token', INVALID_TOKEN);

  const passwordHash = await ctx.passwords.hash(newPassword);
  const now = ctx.clock.now();
  const user = ctx.db.transaction(
    (tx) => {
      const row = consumeEmailToken(tx, now, token, ['reset']);
      if (!row) throw badRequest('invalid_token', INVALID_TOKEN);
      tx.update(users)
        .set({ passwordHash, passwordChangedAt: now })
        .where(eq(users.id, row.userId))
        .run();
      deleteAllSessions(tx, row.userId);
      revokeAllFamilies(tx, now, row.userId);
      return tx.select().from(users).where(eq(users.id, row.userId)).get()!;
    },
    { behavior: 'immediate' },
  );
  sendMailInBackground(ctx, 'password-changed', passwordChangedMail(user.email, user.displayName));
}

/** Löst Bestätigungs- und Adresswechsel-Links ein. */
export function verifyEmailToken(
  ctx: AppContext,
  ip: string,
  token: string,
): { kind: 'verify' | 'email_change' } {
  const limit = ctx.limiter.hit(`verify:ip:${ip}`, 30, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const now = ctx.clock.now();
  const result = ctx.db.transaction(
    (tx) => {
      const row = consumeEmailToken(tx, now, token, ['verify', 'email_change']);
      if (!row) throw badRequest('invalid_token', INVALID_TOKEN);
      const user = tx.select().from(users).where(eq(users.id, row.userId)).get();
      if (!user) throw badRequest('invalid_token', INVALID_TOKEN);
      if (row.kind === 'email_change' && row.newEmail) {
        const taken = tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, row.newEmail))
          .get();
        if (taken) throw conflict('email_taken', 'Diese E-Mail-Adresse ist bereits vergeben');
        tx.update(users)
          .set({ email: row.newEmail, emailVerifiedAt: now })
          .where(eq(users.id, user.id))
          .run();
        return { kind: 'email_change' as const, oldEmail: user.email, name: user.displayName };
      }
      tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id)).run();
      return { kind: 'verify' as const };
    },
    { behavior: 'immediate' },
  );
  if (result.kind === 'email_change') {
    sendMailInBackground(
      ctx,
      'email-changed',
      emailChangedNoticeMail(result.oldEmail, result.name),
    );
  }
  return { kind: result.kind };
}

export function resendVerification(ctx: AppContext, user: User): void {
  if (user.emailVerifiedAt !== null) return;
  const limit = ctx.limiter.hit(`resend:user:${user.id}`, 3, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  sendVerification(ctx, user);
}

/**
 * Adresswechsel mit Passwortprüfung. Mit Mailversand wird die neue Adresse erst nach Klick auf den Link
 * wirksam (und die alte Adresse informiert). Ohne SMTP gilt die Änderung sofort. Ist die neue Adresse
 * schon vergeben, antwortet der Mailweg trotzdem neutral (keine Adress-Enumeration).
 */
export async function requestEmailChange(
  ctx: AppContext,
  user: User,
  newEmailRaw: string,
  password: string,
): Promise<{ status: 'verification_sent' | 'changed' }> {
  const limit = ctx.limiter.hit(`emailchange:user:${user.id}`, 5, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  await verifyReauth(ctx, user, password);
  const newEmail = normalizeEmail(newEmailRaw);
  if (newEmail === user.email)
    throw badRequest('same_email', 'Das ist bereits deine E-Mail-Adresse');

  const exists = !!ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .get();
  if (ctx.mailer.enabled) {
    if (!exists) {
      const token = createEmailToken(ctx.db, ctx.clock.now(), user.id, 'email_change', newEmail);
      sendMailInBackground(
        ctx,
        'email-change',
        emailChangeConfirmMail(newEmail, user.displayName, linkTo(ctx, 'verify', token)),
      );
    }
    return { status: 'verification_sent' };
  }
  if (exists) throw conflict('email_taken', 'Diese E-Mail-Adresse ist bereits vergeben');
  ctx.db
    .update(users)
    .set({ email: newEmail, emailVerifiedAt: null })
    .where(eq(users.id, user.id))
    .run();
  return { status: 'changed' };
}
