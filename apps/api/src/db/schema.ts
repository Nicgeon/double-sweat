import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

// Zeitpunkte: UTC-Millisekunden (integer). Lokale Kalendertage: TEXT 'YYYY-MM-DD'.

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: integer('email_verified_at'),
  passwordHash: text('password_hash').notNull(),
  passwordChangedAt: integer('password_changed_at').notNull(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull(),
  pendingTimezone: text('pending_timezone'),
  pendingFromWeek: text('pending_from_week'),
  reminderTime: text('reminder_time').notNull().default('19:00'),
  createdAt: integer('created_at').notNull(),
});

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Gesetzt, sobald das Team zwei Mitglieder hat. Null, solange es unvollständig ist. */
  fullSince: integer('full_since'),
  createdAt: integer('created_at').notNull(),
});

export const memberships = sqliteTable(
  'memberships',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [
    unique('memberships_team_slot').on(t.teamId, t.slot),
    check('memberships_slot_range', sql`${t.slot} IN (1, 2)`),
  ],
);

export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
    usedAt: integer('used_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('invites_team_idx').on(t.teamId)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    idHash: text('id_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    idleExpiresAt: integer('idle_expires_at').notNull(),
    absExpiresAt: integer('abs_expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const appTokens = sqliteTable(
  'app_tokens',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessHash: text('access_hash').notNull().unique(),
    refreshHash: text('refresh_hash').notNull().unique(),
    deviceLabel: text('device_label'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at').notNull(),
    accessExpires: integer('access_expires').notNull(),
    refreshExpires: integer('refresh_expires').notNull(),
    rotatedAt: integer('rotated_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('app_tokens_family_idx').on(t.familyId), index('app_tokens_user_idx').on(t.userId)],
);

export const emailTokens = sqliteTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['verify', 'reset', 'email_change'] }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    newEmail: text('new_email'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId)],
);

export const weeklyGoals = sqliteTable(
  'weekly_goals',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Montag (lokales Datum), ab dem dieses Ziel gilt. */
    effectiveFrom: text('effective_from').notNull(),
    days: integer('days').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.effectiveFrom] }),
    check('weekly_goals_days_range', sql`${t.days} BETWEEN 1 AND 7`),
  ],
);

export const checkins = sqliteTable(
  'checkins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    /** Vom Server aus Serverzeit und Zeitzone des Nutzers bestimmt, nie vom Client. */
    localDate: text('local_date').notNull(),
    weekStart: text('week_start').notNull(),
    tz: text('tz').notNull(),
    photoKey: text('photo_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    photoSha256: text('photo_sha256').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    note: text('note'),
    tag: text('tag'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique('checkins_user_day').on(t.userId, t.localDate),
    unique('checkins_team_photo').on(t.teamId, t.photoSha256),
    index('checkins_team_week_idx').on(t.teamId, t.weekStart),
  ],
);

export const weekResults = sqliteTable(
  'week_results',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(),
    tz: text('tz').notNull(),
    /** Eingefrorenes Ziel der Woche. Null, wenn kein Ziel gesetzt war (Woche wird dann nicht gewertet). */
    goalDays: integer('goal_days'),
    doneDays: integer('done_days').notNull(),
    /** true/false, oder null, wenn die Woche nicht gewertet wurde. */
    met: integer('met', { mode: 'boolean' }),
    settledAt: integer('settled_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekStart] }),
    index('week_results_team_week_idx').on(t.teamId, t.weekStart),
  ],
);

export const bets = sqliteTable(
  'bets',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** Erster Montag (lokales Datum), für den dieser Einsatz gilt. */
    effectiveFrom: text('effective_from').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [unique('bets_team_effective').on(t.teamId, t.effectiveFrom)],
);

export const debts = sqliteTable(
  'debts',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(),
    debtorId: text('debtor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditorId: text('creditor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Text des Einsatzes zum Zeitpunkt der Abrechnung (spätere Änderungen wirken nicht zurück). */
    betText: text('bet_text').notNull(),
    createdAt: integer('created_at').notNull(),
    redeemedAt: integer('redeemed_at'),
    redeemedBy: text('redeemed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('debts_debtor_week').on(t.debtorId, t.weekStart),
    index('debts_team_idx').on(t.teamId),
  ],
);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const instanceSecrets = sqliteTable('instance_secrets', {
  name: text('name').primaryKey(),
  value: text('value').notNull(),
});

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AppTokenRow = typeof appTokens.$inferSelect;
export type EmailTokenRow = typeof emailTokens.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type WeekResult = typeof weekResults.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Debt = typeof debts.$inferSelect;
