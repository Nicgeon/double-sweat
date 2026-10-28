import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  okSchema,
  protectedSecurity,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { clientIp } from '../../security/client-ip.js';
import { notFound } from '../../util/errors.js';
import { requestPasswordReset, resendVerification, verifyEmailToken } from './service.js';

/** Die Mail-Routen existieren nur, wenn SMTP_URL konfiguriert ist. Sonst: 404. */
function mailEnabled(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    if (!ctx.mailer.enabled) throw notFound();
    await next();
  };
}

export function mailRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Auth (nur mit SMTP)'];
  const gate = mailEnabled(ctx);

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/forgot-password',
      tags,
      summary: 'Passwort vergessen: sendet einen Reset-Link (Antwort ist immer gleich)',
      middleware: [gate],
      request: { body: jsonBody(z.object({ email: z.email().max(254) })) },
      responses: {
        202: jsonResponse(
          okSchema,
          'Falls ein bestätigtes Konto existiert, wurde eine Mail gesendet',
        ),
        ...errorResponses,
      },
    }),
    (c) => {
      requestPasswordReset(ctx, clientIp(c, ctx.config), c.req.valid('json').email);
      return c.json({ ok: true as const }, 202);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/verify-email',
      tags,
      summary: 'E-Mail-Adresse bzw. Adresswechsel per Link-Token bestätigen',
      middleware: [gate],
      request: { body: jsonBody(z.object({ token: z.string().min(10).max(200) })) },
      responses: {
        200: jsonResponse(
          z.object({ ok: z.literal(true), kind: z.enum(['verify', 'email_change']) }),
          'Bestätigt',
        ),
        ...errorResponses,
      },
    }),
    (c) => {
      const { kind } = verifyEmailToken(ctx, clientIp(c, ctx.config), c.req.valid('json').token);
      return c.json({ ok: true as const, kind }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/resend-verification',
      tags,
      summary: 'Bestätigungsmail erneut senden',
      security: protectedSecurity,
      middleware: [gate, requireAuth],
      responses: {
        200: jsonResponse(okSchema, 'Gesendet (oder bereits bestätigt)'),
        ...errorResponses,
      },
    }),
    (c) => {
      resendVerification(ctx, currentAuth(c).user);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
