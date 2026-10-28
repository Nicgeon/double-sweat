import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { sendNudge } from './service.js';

export function nudgeRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/nudges',
      tags: ['Nudges'],
      summary: 'Partner anstupsen (höchstens einmal pro Stunde; sonst 429 mit Retry-After)',
      security: protectedSecurity,
      middleware: [requireAuth],
      responses: {
        202: jsonResponse(z.object({ nextAllowedAt: z.number() }), 'Gesendet'),
        ...errorResponses,
      },
    }),
    (c) => c.json(sendNudge(ctx, currentAuth(c).user), 202),
  );

  return app;
}
