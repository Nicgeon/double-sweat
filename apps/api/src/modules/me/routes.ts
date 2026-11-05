import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { deleteCookie } from 'hono/cookie';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth, sessionCookieName } from '../../http/middleware.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  notificationPrefsSchema,
  okSchema,
  partnerColorSchema,
  protectedSecurity,
  teamSchema,
  userSchema,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { LOCALES } from '../../i18n/locales.js';
import { toUserDto } from '../auth/service.js';
import { requestEmailChange } from '../mail/service.js';
import { getTeamView } from '../teams/service.js';
import { deleteAccount, updateProfile } from './service.js';

const meSchema = z.object({
  user: userSchema,
  team: teamSchema.nullable(),
  csrfToken: z.string().optional(),
  features: z.object({ mail: z.boolean() }),
});

export function meRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Konto'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags,
      summary: 'Eigenes Profil, Team und CSRF-Token (bei Cookie-Anmeldung)',
      ...auth,
      responses: { 200: jsonResponse(meSchema, 'Profil'), ...errorResponses },
    }),
    (c) => {
      const a = currentAuth(c);
      return c.json(
        {
          user: toUserDto(a.user),
          team: getTeamView(ctx, a.user.id),
          csrfToken: a.kind === 'cookie' ? a.csrfToken : undefined,
          features: { mail: ctx.mailer.enabled },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags,
      summary: 'Profil ändern',
      ...auth,
      request: {
        body: jsonBody(
          z.object({
            displayName: z.string().trim().min(1).max(40).optional(),
            color: partnerColorSchema
              .optional()
              .describe('Im Team nicht die Farbe des Partners (409 color_taken)'),
            timezone: z
              .string()
              .min(1)
              .max(64)
              .optional()
              .describe(
                'IANA-Zeitzone. Wirkt ab dem nächsten Wochenstart, sobald es Check-ins gibt.',
              ),
            reminderTime: z
              .string()
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM')
              .optional(),
            locale: z
              .enum(LOCALES)
              .optional()
              .describe('Sprache der Oberfläche, Mitteilungen und Mails'),
            notifications: notificationPrefsSchema
              .partial()
              .optional()
              .describe('Schalter je Art von Mitteilung; nicht genannte bleiben, wie sie sind'),
          }),
        ),
      },
      responses: {
        200: jsonResponse(z.object({ user: userSchema }), 'Aktualisiert'),
        ...errorResponses,
      },
    }),
    (c) => {
      const user = updateProfile(ctx, currentAuth(c).user, c.req.valid('json'));
      return c.json({ user: toUserDto(user) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/email',
      tags,
      summary: 'E-Mail-Adresse ändern (Passwort nötig; mit SMTP erst nach Bestätigung wirksam)',
      ...auth,
      request: {
        body: jsonBody(
          z.object({ newEmail: z.email().max(254), password: z.string().min(1).max(256) }),
        ),
      },
      responses: {
        202: jsonResponse(
          z.object({ status: z.enum(['verification_sent', 'changed']) }),
          'Angenommen',
        ),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { newEmail, password } = c.req.valid('json');
      return c.json(await requestEmailChange(ctx, currentAuth(c).user, newEmail, password), 202);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/me',
      tags,
      summary: 'Konto und eigene Daten löschen (Passwort nötig)',
      ...auth,
      request: { body: jsonBody(z.object({ password: z.string().min(1).max(256) })) },
      responses: { 200: jsonResponse(okSchema, 'Gelöscht'), ...errorResponses },
    }),
    async (c) => {
      await deleteAccount(ctx, currentAuth(c).user, c.req.valid('json').password);
      deleteCookie(c, sessionCookieName(ctx), { path: '/', secure: ctx.config.secureCookies });
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
