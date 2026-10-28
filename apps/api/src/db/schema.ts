import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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
