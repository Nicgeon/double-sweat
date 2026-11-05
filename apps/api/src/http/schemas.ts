import { z } from '@hono/zod-openapi';
import { PARTNER_COLORS } from '../domain/colors.js';
import { LOCALES } from '../i18n/locales.js';

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('Error');

export const partnerColorSchema = z
  .enum(PARTNER_COLORS)
  .describe('Identitätsfarbe aus der Palette (Tokens in design/tokens.json)')
  .openapi('PartnerColor');

export const okSchema = z.object({ ok: z.literal(true) }).openapi('Ok');

/** Schalter je Art von Mitteilung (siehe modules/notifications/prefs.ts); `true` = kommt per Push an. */
export const notificationPrefsSchema = z
  .object({
    reminder: z.boolean().describe('Abendliche Erinnerung, wenn das Wochenziel gefährdet ist'),
    nudge: z.boolean().describe('Anstupser vom Partner'),
    checkin: z.boolean().describe('Check-ins des Partners und sein erreichtes Wochenziel'),
    reaction: z.boolean().describe('Reaktionen auf deine Fotos'),
    agreement: z.boolean().describe('Änderungen an Einsatz und Belohnung, Einlösungen'),
    result: z.boolean().describe('Wochenergebnis, Schulden und Belohnungen'),
    streak: z.boolean().describe('Serie: Meilensteine und gerissene Serie'),
  })
  .openapi('NotificationPrefs');

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    displayName: z.string(),
    color: partnerColorSchema,
    timezone: z.string(),
    pendingTimezone: z.string().nullable(),
    reminderTime: z.string(),
    locale: z.enum(LOCALES).describe('Sprache der Oberfläche, Mitteilungen und Mails'),
    notifications: notificationPrefsSchema.describe(
      'Welche Arten von Mitteilungen per Push kommen. Das Postfach bekommt immer alles.',
    ),
  })
  .openapi('User');

export const teamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    full: z.boolean(),
    fullSince: z.number().nullable(),
    members: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        slot: z.number().describe('Platz im Team (1 Kreis, 2 Quadrat)'),
        color: partnerColorSchema,
        timezone: z.string(),
        isMe: z.boolean(),
      }),
    ),
    invite: z.object({ createdAt: z.number(), expiresAt: z.number() }).nullable(),
  })
  .openapi('Team');

export const tokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().describe('Gültigkeit des Access-Tokens in Sekunden'),
    refreshExpiresAt: z.number(),
  })
  .openapi('Tokens');

export const authResultSchema = z
  .object({
    user: userSchema,
    team: teamSchema.nullable(),
    csrfToken: z
      .string()
      .optional()
      .describe('Nur bei Cookie-Anmeldung: Wert für den Header X-CSRF-Token'),
    tokens: tokensSchema.optional().describe('Nur bei App-Anmeldung'),
  })
  .openapi('AuthResult');

export const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { 'application/json': { schema } },
});

export const errorResponses = {
  400: jsonResponse(errorSchema, 'Ungültige Eingabe'),
  401: jsonResponse(errorSchema, 'Nicht angemeldet'),
  403: jsonResponse(errorSchema, 'Nicht erlaubt'),
  404: jsonResponse(errorSchema, 'Nicht gefunden'),
  409: jsonResponse(errorSchema, 'Konflikt'),
  429: jsonResponse(errorSchema, 'Zu viele Anfragen (Retry-After beachten)'),
};

export const protectedSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];
