import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { jsonResponse } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { LOCALES } from '../../i18n/locales.js';
import { API_VERSION, APP_NAME, APP_VERSION, MIN_CLIENT_API } from '../../version.js';

export function healthRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['System'],
      summary:
        'Erreichbarkeit und Serverfähigkeiten (öffentlich, für die Server-URL-Prüfung der App)',
      responses: {
        200: jsonResponse(
          z.object({
            app: z.literal(APP_NAME),
            version: z.string(),
            apiVersion: z.number(),
            minClientApi: z.number(),
            signup: z.object({
              mode: z.enum(['open', 'token', 'invite-only', 'closed']),
              requiresSetupToken: z.boolean(),
            }),
            features: z.object({ mail: z.boolean() }),
            defaultLocale: z
              .enum(LOCALES)
              .describe(
                'Standardsprache des Servers (DEFAULT_LOCALE), wenn ein Client keine eigene hat',
              ),
          }),
          'Server läuft',
        ),
        503: jsonResponse(
          z.object({ app: z.literal(APP_NAME), status: z.literal('unavailable') }),
          'Datenbank nicht erreichbar',
        ),
      },
    }),
    (c) => {
      try {
        ctx.db.$client.prepare('SELECT 1').get();
      } catch {
        return c.json({ app: APP_NAME, status: 'unavailable' as const }, 503);
      }
      return c.json(
        {
          app: APP_NAME,
          version: APP_VERSION,
          apiVersion: API_VERSION,
          minClientApi: MIN_CLIENT_API,
          signup: {
            mode: ctx.config.signupMode,
            requiresSetupToken: ctx.config.signupMode === 'token',
          },
          features: { mail: ctx.mailer.enabled },
          defaultLocale: ctx.config.defaultLocale,
        },
        200,
      );
    },
  );

  return app;
}
