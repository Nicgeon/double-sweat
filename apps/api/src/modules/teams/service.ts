import { and, count, eq, gt, isNull, ne } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { type Invite, invites, memberships, type Team, teams, users } from '../../db/schema.js';
import { type PartnerColor, pickColor } from '../../domain/colors.js';
import {
  generateInviteCode,
  hashToken,
  normalizeInviteCode,
  safeEqual,
} from '../../security/tokens.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { DAY, HOUR } from '../../util/time.js';
import { photoKeysFor } from '../photos/keys.js';

export const INVITE_TTL_MS = 7 * DAY;
export const TEAM_SIZE = 2;

/** Registrierung bzw. Teilnahme ist grundsätzlich möglich (SIGNUP_MODE != closed). */
export function assertSignupOpen(ctx: AppContext): void {
  if (ctx.config.signupMode === 'closed') {
    throw forbidden('signup_disabled', 'Auf diesem Server ist die Registrierung deaktiviert');
  }
}

/** Darf ein neues Team ohne Einladung angelegt werden? Das hängt von SIGNUP_MODE ab. */
export function assertTeamCreationAllowed(ctx: AppContext, setupToken: string | undefined): void {
  const { signupMode, setupToken: expected } = ctx.config;
  if (signupMode === 'closed' || signupMode === 'invite-only') {
    throw forbidden(
      'signup_disabled',
      'Neue Teams können auf diesem Server nicht selbst angelegt werden',
    );
  }
  if (signupMode === 'token') {
    if (!setupToken || !expected || !safeEqual(setupToken, expected)) {
      throw forbidden('invalid_setup_token', 'Setup-Token fehlt oder ist falsch');
    }
  }
}

/** Muss innerhalb der Schreib-Transaktion aufgerufen werden, damit das Limit nicht per Race umgangen wird. */
export function assertTeamLimit(db: DbLike, ctx: AppContext): void {
  const max = ctx.config.maxTeams;
  if (max <= 0) return;
  const total = db.select({ n: count() }).from(teams).get()?.n ?? 0;
  if (total >= max)
    throw forbidden('team_limit', 'Die maximale Anzahl an Teams auf diesem Server ist erreicht');
}

export function createTeamTx(db: DbLike, name: string, now: number): Team {
  const team: Team = { id: newId(now), name, fullSince: null, createdAt: now };
  db.insert(teams).values(team).run();
  return team;
}

export interface JoinColor {
  /** Ausdrücklich gewählte Farbe; ist sie im Team vergeben, schlägt der Beitritt mit color_taken fehl. */
  requested?: PartnerColor | undefined;
  /** true bei einem frisch angelegten Konto: Es gilt der Standard des Platzes statt der Platzhalterfarbe. */
  fresh?: boolean | undefined;
}

/**
 * Fügt einen Nutzer dem Team hinzu. Belegt den freien Platz (slot 1 oder 2); schlägt bei vollem Team fehl.
 * Setzt dabei die Farbe: gewählt, sonst die bisherige bzw. der Standard des Platzes, nie die des Partners.
 */
export function addMemberTx(
  db: DbLike,
  teamId: string,
  userId: string,
  now: number,
  color: JoinColor = {},
): void {
  const members = db
    .select({ slot: memberships.slot, color: users.color })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .all();
  if (members.length >= TEAM_SIZE)
    throw conflict('team_full', 'Dieses Team ist bereits vollständig');
  const slot = members.some((m) => m.slot === 1) ? 2 : 1;
  const partnerColor = members[0]?.color ?? null;
  if (color.requested && color.requested === partnerColor)
    throw conflict('color_taken', 'Diese Farbe hat dein Partner schon gewählt');
  const current = db.select({ color: users.color }).from(users).where(eq(users.id, userId)).get();
  const preferred = color.requested ?? (color.fresh ? null : (current?.color ?? null));
  const chosen = pickColor(slot, partnerColor, preferred);
  if (chosen !== current?.color)
    db.update(users).set({ color: chosen }).where(eq(users.id, userId)).run();
  db.insert(memberships).values({ teamId, userId, slot, joinedAt: now }).run();
  if (members.length + 1 === TEAM_SIZE) {
    db.update(teams).set({ fullSince: now }).where(eq(teams.id, teamId)).run();
  }
}

/** Farbe der anderen Person im Team (null, wenn es keine gibt). */
export function partnerColorOf(db: DbLike, teamId: string, userId: string): PartnerColor | null {
  return (
    db
      .select({ color: users.color })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.teamId, teamId), ne(memberships.userId, userId)))
      .get()?.color ?? null
  );
}

export function findValidInvite(db: DbLike, now: number, code: string): Invite | null {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  return (
    db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.tokenHash, hashToken('invite', normalized)),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, now),
        ),
      )
      .get() ?? null
  );
}

export function getMembership(db: DbLike, userId: string) {
  return db.select().from(memberships).where(eq(memberships.userId, userId)).get() ?? null;
}

/** Öffentliche Vorschau einer Einladung (für die Beitrittsseite). */
export function peekInvite(
  ctx: AppContext,
  ip: string,
  code: string,
): { inviterName: string; inviterColor: PartnerColor | null; teamName: string } {
  const limit = ctx.limiter.hit(`invite:peek:${ip}`, 30, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const invite = findValidInvite(ctx.db, ctx.clock.now(), code);
  if (!invite) throw notFound('Einladung ungültig oder abgelaufen');
  const team = ctx.db.select().from(teams).where(eq(teams.id, invite.teamId)).get();
  const inviter = invite.createdBy
    ? ctx.db
        .select({ name: users.displayName, color: users.color })
        .from(users)
        .where(eq(users.id, invite.createdBy))
        .get()
    : undefined;
  return {
    inviterName: inviter?.name ?? 'Dein Partner',
    inviterColor: inviter?.color ?? null,
    teamName: team?.name ?? 'Team',
  };
}

export interface CreatedInvite {
  code: string;
  joinUrl: string;
  expiresAt: number;
}

export function createInvite(ctx: AppContext, userId: string): CreatedInvite {
  const membership = getMembership(ctx.db, userId);
  if (!membership) throw badRequest('no_team', 'Du bist in keinem Team');
  return createTeamInvite(ctx, membership.teamId, userId);
}

/** Erzeugt eine Einladung für ein Team und ersetzt eine noch offene. createdBy ist null bei CLI-Einladungen. */
export function createTeamInvite(
  ctx: AppContext,
  teamId: string,
  createdBy: string | null,
): CreatedInvite {
  const now = ctx.clock.now();
  const code = generateInviteCode();
  const expiresAt = now + INVITE_TTL_MS;
  ctx.db.transaction(
    (tx) => {
      if (!tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).get()) {
        throw notFound('Team nicht gefunden');
      }
      const size =
        tx.select({ n: count() }).from(memberships).where(eq(memberships.teamId, teamId)).get()
          ?.n ?? 0;
      if (size >= TEAM_SIZE) throw conflict('team_full', 'Dein Team ist bereits vollständig');
      tx.update(invites)
        .set({ revokedAt: now })
        .where(and(eq(invites.teamId, teamId), isNull(invites.usedAt), isNull(invites.revokedAt)))
        .run();
      tx.insert(invites)
        .values({
          id: newId(now),
          teamId,
          tokenHash: hashToken('invite', code.replaceAll('-', '')),
          createdBy,
          createdAt: now,
          expiresAt,
        })
        .run();
    },
    { behavior: 'immediate' },
  );
  return { code, joinUrl: `${ctx.config.publicOrigin}/join/${code}`, expiresAt };
}

export function revokeActiveInvite(ctx: AppContext, userId: string): void {
  const membership = getMembership(ctx.db, userId);
  if (!membership) throw badRequest('no_team', 'Du bist in keinem Team');
  ctx.db
    .update(invites)
    .set({ revokedAt: ctx.clock.now() })
    .where(
      and(eq(invites.teamId, membership.teamId), isNull(invites.usedAt), isNull(invites.revokedAt)),
    )
    .run();
}

/** Bestehender Nutzer ohne Team tritt per Code bei. */
export function joinTeamWithCode(
  ctx: AppContext,
  ip: string,
  userId: string,
  code: string,
  requested?: PartnerColor,
): Team {
  assertSignupOpen(ctx);
  const limit = ctx.limiter.hit(`invite:join:${ip}`, 15, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const now = ctx.clock.now();
  const team = ctx.db.transaction(
    (tx) => {
      if (getMembership(tx, userId))
        throw conflict('already_in_team', 'Du bist bereits in einem Team');
      const invite = findValidInvite(tx, now, code);
      if (!invite) throw badRequest('invalid_invite', 'Einladung ungültig oder abgelaufen');
      addMemberTx(tx, invite.teamId, userId, now, { requested });
      tx.update(invites)
        .set({ usedBy: userId, usedAt: now })
        .where(eq(invites.id, invite.id))
        .run();
      return tx.select().from(teams).where(eq(teams.id, invite.teamId)).get()!;
    },
    { behavior: 'immediate' },
  );
  notifyPartnerJoined(ctx, team.id, userId);
  return team;
}

/** Sagt der Person, die schon im Team war, dass jemand beigetreten ist. */
export function notifyPartnerJoined(ctx: AppContext, teamId: string, joinedUserId: string): void {
  const joined = ctx.db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, joinedUserId))
    .get();
  if (!joined) return;
  const others = ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.teamId, teamId))
    .all()
    .filter((m) => m.userId !== joinedUserId);
  for (const other of others) {
    ctx.push.notify(other.userId, {
      type: 'partner_joined',
      params: { name: joined.name },
      data: { userId: joinedUserId },
    });
  }
}

/** Bestehender Nutzer ohne Team legt ein neues an (gleiche Regeln wie bei der Registrierung). */
export function createTeamForUser(
  ctx: AppContext,
  userId: string,
  name: string,
  setupToken: string | undefined,
): Team {
  assertTeamCreationAllowed(ctx, setupToken);
  const now = ctx.clock.now();
  return ctx.db.transaction(
    (tx) => {
      if (getMembership(tx, userId))
        throw conflict('already_in_team', 'Du bist bereits in einem Team');
      assertTeamLimit(tx, ctx);
      const team = createTeamTx(tx, name, now);
      addMemberTx(tx, team.id, userId, now);
      return team;
    },
    { behavior: 'immediate' },
  );
}

export interface TeamView {
  id: string;
  name: string;
  full: boolean;
  fullSince: number | null;
  members: {
    id: string;
    displayName: string;
    slot: number;
    color: PartnerColor;
    timezone: string;
    isMe: boolean;
  }[];
  invite: { createdAt: number; expiresAt: number } | null;
}

export function getTeamView(ctx: AppContext, userId: string): TeamView | null {
  const membership = getMembership(ctx.db, userId);
  if (!membership) return null;
  const team = ctx.db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
  if (!team) return null;
  const members = ctx.db
    .select({
      id: users.id,
      displayName: users.displayName,
      slot: memberships.slot,
      color: users.color,
      timezone: users.timezone,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, team.id))
    .orderBy(memberships.slot)
    .all();
  const invite = ctx.db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.teamId, team.id),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, ctx.clock.now()),
      ),
    )
    .get();
  return {
    id: team.id,
    name: team.name,
    full: team.fullSince !== null,
    fullSince: team.fullSince,
    members: members.map((m) => ({ ...m, isMe: m.id === userId })),
    invite: invite ? { createdAt: invite.createdAt, expiresAt: invite.expiresAt } : null,
  };
}

/** Löst das Team auf. Beide Konten bleiben bestehen; Teamdaten und Fotos werden gelöscht. */
export async function dissolveTeam(ctx: AppContext, userId: string): Promise<void> {
  const membership = getMembership(ctx.db, userId);
  if (!membership) throw badRequest('no_team', 'Du bist in keinem Team');
  const actor = ctx.db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const partners = ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.teamId, membership.teamId))
    .all()
    .filter((m) => m.userId !== userId);
  const keys = ctx.db.transaction(
    (tx) => {
      const photoKeys = photoKeysFor(tx, { teamId: membership.teamId });
      tx.delete(teams).where(eq(teams.id, membership.teamId)).run();
      return photoKeys;
    },
    { behavior: 'immediate' },
  );
  await ctx.photos.remove(keys);
  for (const partner of partners) {
    ctx.push.notify(partner.userId, {
      type: 'team_dissolved',
      params: actor?.name ? { name: actor.name } : {},
    });
  }
}
