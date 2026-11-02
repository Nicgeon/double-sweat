import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { BET_HORIZON_WEEKS, BET_MAX_LENGTH, getBetOverview, removeBet, setBet } from './service.js';

const entrySchema = z.object({
  text: z.string(),
  effectiveFrom: z.string().describe('Montag, ab dem dieser Einsatz gilt'),
});

const personSchema = z.object({
  current: z.string().nullable().describe('Einsatz für die laufende Woche'),
  currentFrom: z.string().nullable().describe('Seit welchem Montag der aktuelle Einsatz gilt'),
  upcoming: z.array(entrySchema).describe('Festgelegte Änderungen für spätere Wochen, aufsteigend'),
});

const betSchema = z
  .object({
    currentWeekStart: z.string().describe('Montag deiner laufenden Woche'),
    mine: personSchema.describe('Dein Einsatz: was du deinem Partner schuldest, wenn du verfehlst'),
    partner: personSchema
      .extend({ displayName: z.string() })
      .nullable()
      .describe('Der Einsatz deines Partners (null, solange du keinen hast)'),
    required: z
      .boolean()
      .describe(
        'Du musst jetzt einen Einsatz für diese Woche festlegen (ab der ersten vollen Woche)',
      ),
  })
  .openapi('Bet');

export function betRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Einsatz'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/bets',
      tags,
      summary:
        'Dein Einsatz und der deines Partners, jeweils mit den für später festgelegten Änderungen',
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
      summary: `Eigenen Einsatz festlegen (Freitext). Er gilt ab dem Montag \`from\` (Standard: laufende Woche, höchstens ${BET_HORIZON_WEEKS} Wochen im Voraus) und bleibt gültig, bis ein späterer ihn ablöst. Ohne Einsatz wird keine Woche gewertet.`,
      ...auth,
      request: {
        body: jsonBody(
          z.object({
            text: z.string().trim().min(1).max(BET_MAX_LENGTH),
            from: z.string().optional().describe('Montag (YYYY-MM-DD), ab dem er gilt'),
          }),
        ),
      },
      responses: { 200: jsonResponse(betSchema, 'Gesetzt'), ...errorResponses },
    }),
    (c) => {
      const body = c.req.valid('json');
      return c.json(setBet(ctx, currentAuth(c).user, body.text, body.from), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/bets/{from}',
      tags,
      summary: 'Einen für eine spätere Woche festgelegten Einsatz zurücknehmen',
      ...auth,
      request: { params: z.object({ from: z.string() }) },
      responses: { 200: jsonResponse(betSchema, 'Zurückgenommen'), ...errorResponses },
    }),
    (c) => c.json(removeBet(ctx, currentAuth(c).user, c.req.valid('param').from), 200),
  );

  return app;
}
