import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { BET_MAX_LENGTH, getBetOverview, setBet } from './service.js';

const betSchema = z
  .object({
    current: z.string().nullable().describe('Einsatz der laufenden Woche'),
    upcoming: z
      .object({ text: z.string(), effectiveFrom: z.string() })
      .nullable()
      .describe('Beschlossene Änderung, die erst ab dem genannten Montag gilt'),
  })
  .openapi('Bet');

export function betRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Wetteinsatz'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bets',
      tags,
      summary: 'Aktueller Einsatz des Teams und eine ggf. bereits beschlossene Änderung',
      ...auth,
      responses: { 200: jsonResponse(betSchema, 'Einsatz'), ...errorResponses },
    }),
    (c) => c.json(getBetOverview(ctx, currentAuth(c).user), 200),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/bets',
      tags,
      summary:
        'Einsatz festlegen (Freitext). Der erste Einsatz gilt sofort, spätere Änderungen erst für Wochen, die noch bei keinem Partner begonnen haben. Ohne Einsatz wird keine Woche gewertet.',
      ...auth,
      request: { body: jsonBody(z.object({ text: z.string().trim().min(1).max(BET_MAX_LENGTH) })) },
      responses: { 200: jsonResponse(betSchema, 'Gesetzt'), ...errorResponses },
    }),
    (c) => c.json(setBet(ctx, currentAuth(c).user, c.req.valid('json').text), 200),
  );

  return app;
}
