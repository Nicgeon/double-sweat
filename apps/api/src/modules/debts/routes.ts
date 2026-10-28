import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { listDebts, setRedeemed } from './service.js';

const debtSchema = z
  .object({
    id: z.string(),
    weekStart: z.string(),
    betText: z.string().describe('Einsatz zum Zeitpunkt der Abrechnung'),
    createdAt: z.number(),
    redeemedAt: z.number().nullable(),
    direction: z.enum(['owe', 'owed']).describe('owe: du schuldest, owed: dir wird geschuldet'),
    debtorName: z.string(),
    creditorName: z.string(),
  })
  .openapi('Debt');

export function debtRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Wetteinsatz'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };
  const idParam = z.object({ id: z.string().min(1).max(40) });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/debts',
      tags,
      summary: 'Schulden im Team (Standard: offene)',
      ...auth,
      request: { query: z.object({ status: z.enum(['open', 'redeemed', 'all']).default('open') }) },
      responses: {
        200: jsonResponse(z.object({ debts: z.array(debtSchema) }), 'Schulden'),
        ...errorResponses,
      },
    }),
    (c) => c.json({ debts: listDebts(ctx, currentAuth(c).user, c.req.valid('query').status) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/debts/{id}/redeem',
      tags,
      summary: 'Schuld als eingelöst markieren (nur durch die Person, der etwas geschuldet wird)',
      ...auth,
      request: { params: idParam },
      responses: {
        200: jsonResponse(z.object({ debt: debtSchema }), 'Eingelöst'),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json({ debt: setRedeemed(ctx, currentAuth(c).user, c.req.valid('param').id, true) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/debts/{id}/redeem',
      tags,
      summary: 'Einlösung zurücknehmen (nur durch die Person, der etwas geschuldet wird)',
      ...auth,
      request: { params: idParam },
      responses: {
        200: jsonResponse(z.object({ debt: debtSchema }), 'Wieder offen'),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json({ debt: setRedeemed(ctx, currentAuth(c).user, c.req.valid('param').id, false) }, 200),
  );

  return app;
}
