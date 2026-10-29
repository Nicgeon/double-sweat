import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { invites, type Team, teams, type User, users } from '../../db/schema.js';
import type { PartnerColor } from '../../domain/colors.js';
import type { Locale } from '../../i18n/locales.js';
import { keyPart } from '../../security/ratelimit.js';
import {
  badRequest,
  conflict,
  forbidden,
  tooManyRequests,
  unauthorized,
} from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR, MINUTE } from '../../util/time.js';
import { isValidTimeZone } from '../../util/timezone.js';
import { linkTo, sendMailInBackground } from '../mail/send.js';
import { passwordChangedMail, verifyEmailMail } from '../mail/templates.js';
import { createEmailToken } from '../mail/tokens.js';
import {
  addMemberTx,
  assertSignupOpen,
  assertTeamCreationAllowed,
  assertTeamLimit,
  createTeamTx,
  findValidInvite,
} from '../teams/service.js';
import { revokeAllFamilies } from './app-tokens.js';
import { deleteAllSessions } from './sessions.js';

export const passwordSchema = z
  .string()
  .min(10, 'Mindestens 10 Zeichen')
  .max(128, 'Höchstens 128 Zeichen');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface UserDto {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  color: PartnerColor;
  timezone: string;
  pendingTimezone: string | null;
  reminderTime: string;
  locale: Locale;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    displayName: user.displayName,
    color: user.color,
    timezone: user.timezone,
    pendingTimezone: user.pendingTimezone,
    reminderTime: user.reminderTime,
    locale: user.locale,
  };
}

const LOGIN_WINDOW_MS = 15 * MINUTE;
const LOGIN_IP_LIMIT = 30;
const LOGIN_EMAIL_LIMIT = 8;

/**
 * Prüft E-Mail und Passwort. Schutz gegen Brute-Force und Enumeration:
 * Limit pro IP (alle Versuche) und pro Adresse (Fehlversuche), Dummy-Hash für unbekannte Adressen,
 * einheitliche Fehlermeldung.
 */
export async function authenticate(
  ctx: AppContext,
  ip: string,
  emailRaw: string,
  password: string,
): Promise<User> {
  const email = normalizeEmail(emailRaw);
  const ipHit = ctx.limiter.hit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
  if (ipHit.limited)
    throw tooManyRequests(
      ipHit.retryAfterSec,
      'Zu viele Anmeldeversuche, bitte später erneut versuchen',
    );
  const emailKey = `login:email:${keyPart(email)}`;
  const emailState = ctx.limiter.peek(emailKey, LOGIN_EMAIL_LIMIT);
  if (emailState.limited) {
    throw tooManyRequests(
      emailState.retryAfterSec,
      'Zu viele Anmeldeversuche, bitte später erneut versuchen',
    );
  }

  const fail = (): never => {
    ctx.limiter.hit(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_MS);
    throw unauthorized('E-Mail oder Passwort ist falsch');
  };

  const user = ctx.db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await ctx.passwords.dummyVerify(password);
    return fail();
  }
  if (!(await ctx.passwords.verify(user.passwordHash, password))) return fail();

  ctx.limiter.reset(emailKey);
  if (ctx.passwords.needsRehash(user.passwordHash)) {
    const passwordHash = await ctx.passwords.hash(password);
    ctx.db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
  }
  return user;
}

/** Passwortprüfung für sensible Aktionen (Löschen, Export, Adresswechsel). Antwortet mit 403, nicht 401. */
export async function verifyReauth(ctx: AppContext, user: User, password: string): Promise<void> {
  const key = `reauth:${user.id}`;
  const state = ctx.limiter.peek(key, 5);
  if (state.limited) throw tooManyRequests(state.retryAfterSec);
  if (!(await ctx.passwords.verify(user.passwordHash, password))) {
    ctx.limiter.hit(key, 5, LOGIN_WINDOW_MS);
    throw forbidden('invalid_password', 'Das Passwort ist falsch');
  }
  ctx.limiter.reset(key);
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  inviteCode?: string | undefined;
  setupToken?: string | undefined;
  teamName?: string | undefined;
  /** Wunschfarbe; ohne Angabe gilt der Standard des Platzes (1 Ember, 2 Tide). */
  color?: PartnerColor | undefined;
  /** Sprache des Kontos; ohne Angabe die Standardsprache des Servers. */
  locale?: Locale | undefined;
}

/**
 * Registrierung: entweder per Einladungscode (Beitritt zu einem bestehenden Team) oder als Gründung eines
 * neuen Teams (je nach SIGNUP_MODE mit Setup-Token). Konto, Team-Zuordnung und Einladung entstehen in
 * einer Transaktion.
 */
export async function registerAccount(
  ctx: AppContext,
  ip: string,
  input: RegisterInput,
): Promise<{ user: User; team: Team }> {
  const limit = ctx.limiter.hit(`register:ip:${ip}`, 10, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  assertSignupOpen(ctx);
  if (!isValidTimeZone(input.timezone)) throw badRequest('invalid_timezone', 'Unbekannte Zeitzone');

  const now = ctx.clock.now();
  // Günstige Prüfungen vor dem teuren Passwort-Hashing
  if (input.inviteCode) {
    if (!findValidInvite(ctx.db, now, input.inviteCode)) {
      throw badRequest('invalid_invite', 'Einladung ungültig oder abgelaufen');
    }
  } else {
    assertTeamCreationAllowed(ctx, input.setupToken);
  }

  const email = normalizeEmail(input.email);
  const passwordHash = await ctx.passwords.hash(input.password);

  const result = ctx.db.transaction(
    (tx) => {
      if (tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
        throw conflict('email_taken', 'Diese E-Mail-Adresse ist bereits registriert');
      }
      const invite = input.inviteCode ? findValidInvite(tx, now, input.inviteCode) : null;
      if (input.inviteCode && !invite)
        throw badRequest('invalid_invite', 'Einladung ungültig oder abgelaufen');

      let team: Team;
      if (invite) {
        team = tx.select().from(teams).where(eq(teams.id, invite.teamId)).get()!;
      } else {
        assertTeamLimit(tx, ctx);
        team = createTeamTx(tx, input.teamName ?? 'Unser Team', now);
      }

      const user: User = {
        id: newId(now),
        email,
        emailVerifiedAt: null,
        passwordHash,
        passwordChangedAt: now,
        displayName: input.displayName.trim(),
        color: 'ember',
        timezone: input.timezone,
        pendingTimezone: null,
        pendingFromWeek: null,
        reminderTime: '19:00',
        locale: input.locale ?? ctx.config.defaultLocale,
        createdAt: now,
      };
      tx.insert(users).values(user).run();
      addMemberTx(tx, team.id, user.id, now, { requested: input.color, fresh: true });
      if (invite)
        tx.update(invites)
          .set({ usedBy: user.id, usedAt: now })
          .where(eq(invites.id, invite.id))
          .run();

      // addMemberTx kann die Farbe angepasst haben: den gespeicherten Stand zurückgeben
      return {
        user: tx.select().from(users).where(eq(users.id, user.id)).get()!,
        team: tx.select().from(teams).where(eq(teams.id, team.id)).get()!,
      };
    },
    { behavior: 'immediate' },
  );

  if (ctx.mailer.enabled) sendVerification(ctx, result.user);
  return result;
}

/** Erzeugt ein Bestätigungs-Token und verschickt es im Hintergrund. */
export function sendVerification(ctx: AppContext, user: User): void {
  const token = createEmailToken(ctx.db, ctx.clock.now(), user.id, 'verify');
  sendMailInBackground(
    ctx,
    'verify',
    verifyEmailMail(user.locale, user.email, user.displayName, linkTo(ctx, 'verify', token)),
  );
}

export async function changePassword(
  ctx: AppContext,
  user: User,
  currentPassword: string,
  newPassword: string,
  keep: { sessionId?: string; familyId?: string },
): Promise<void> {
  await verifyReauth(ctx, user, currentPassword);
  const passwordHash = await ctx.passwords.hash(newPassword);
  const now = ctx.clock.now();
  ctx.db.transaction(
    (tx) => {
      tx.update(users)
        .set({ passwordHash, passwordChangedAt: now })
        .where(eq(users.id, user.id))
        .run();
      deleteAllSessions(tx, user.id, keep.sessionId);
      revokeAllFamilies(tx, now, user.id, keep.familyId);
    },
    { behavior: 'immediate' },
  );
  sendMailInBackground(
    ctx,
    'password-changed',
    passwordChangedMail(user.locale, user.email, user.displayName),
  );
}
