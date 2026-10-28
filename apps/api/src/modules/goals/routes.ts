import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { getGoalOverview, setNextWeekGoal } from './service.js';

const overviewSchema = z
  .object({
    currentWeekStart: z.string().describe('Montag der laufenden Woche (YYYY-MM-DD, lokale Zeit)'),
    currentGoal: z.number().nullable().describe('Ziel der laufenden Woche, eingefroren'),
    nextWeekStart: z.string(),
    nextGoal: z.number().nullable().describe('Ziel ab der kommenden Woche, änderbar'),
  })
  .openapi('GoalOverview');

export function goalRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Wochenziel'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/goals',
      tags,
      summary: 'Wochenziel: laufende und kommende Woche',
      ...auth,
      responses: { 200: jsonResponse(overviewSchema, 'Ziele'), ...errorResponses },
    }),
    (c) => c.json(getGoalOverview(ctx, currentAuth(c).user), 200),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/goals/next',
      tags,
      summary: 'Ziel für die kommende Woche setzen (die laufende Woche bleibt unverändert)',
      ...auth,
      request: { body: jsonBody(z.object({ days: z.number().int().min(1).max(7) })) },
      responses: { 200: jsonResponse(overviewSchema, 'Gesetzt'), ...errorResponses },
    }),
    (c) => c.json(setNextWeekGoal(ctx, currentAuth(c).user, c.req.valid('json').days), 200),
  );

  return app;
}
