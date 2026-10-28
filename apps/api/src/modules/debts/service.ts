import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { type Debt, debts, type User, users } from '../../db/schema.js';
import { forbidden, notFound } from '../../util/errors.js';
import { getMembership } from '../teams/service.js';

export interface DebtDto {
  id: string;
  weekStart: string;
  betText: string;
  createdAt: number;
  redeemedAt: number | null;
  /** owe: Du schuldest dem Partner, owed: Der Partner schuldet dir. */
  direction: 'owe' | 'owed';
  debtorName: string;
  creditorName: string;
}

export type DebtFilter = 'open' | 'redeemed' | 'all';

function teamIdOf(ctx: AppContext, user: User): string {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  return membership.teamId;
}

function toDto(ctx: AppContext, row: Debt, viewerId: string): DebtDto {
  const name = (id: string) =>
    ctx.db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ??
    'Unbekannt';
  return {
    id: row.id,
    weekStart: row.weekStart,
    betText: row.betText,
    createdAt: row.createdAt,
    redeemedAt: row.redeemedAt,
    direction: row.debtorId === viewerId ? 'owe' : 'owed',
    debtorName: name(row.debtorId),
    creditorName: name(row.creditorId),
  };
}

export function listDebts(ctx: AppContext, user: User, filter: DebtFilter): DebtDto[] {
  const teamId = teamIdOf(ctx, user);
  const state =
    filter === 'open'
      ? isNull(debts.redeemedAt)
      : filter === 'redeemed'
        ? isNotNull(debts.redeemedAt)
        : undefined;
  return ctx.db
    .select()
    .from(debts)
    .where(and(eq(debts.teamId, teamId), state))
    .orderBy(desc(debts.weekStart), desc(debts.createdAt))
    .all()
    .map((row) => toDto(ctx, row, user.id));
}

function findDebt(ctx: AppContext, user: User, id: string): Debt {
  const teamId = teamIdOf(ctx, user);
  const row = ctx.db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.teamId, teamId)))
    .get();
  if (!row) throw notFound('Schuld nicht gefunden');
  return row;
}

/** Nur wer etwas zu bekommen hat, bestätigt die Einlösung. Schuldner können ihre Schuld nicht selbst streichen. */
export function setRedeemed(ctx: AppContext, user: User, id: string, redeemed: boolean): DebtDto {
  const debt = findDebt(ctx, user, id);
  if (debt.creditorId !== user.id) {
    throw forbidden(
      'not_creditor',
      'Nur die Person, der etwas geschuldet wird, kann das bestätigen',
    );
  }
  const wasRedeemed = debt.redeemedAt !== null;
  if (wasRedeemed !== redeemed) {
    ctx.db
      .update(debts)
      .set(
        redeemed
          ? { redeemedAt: ctx.clock.now(), redeemedBy: user.id }
          : { redeemedAt: null, redeemedBy: null },
      )
      .where(eq(debts.id, id))
      .run();
  }
  return toDto(ctx, findDebt(ctx, user, id), user.id);
}
