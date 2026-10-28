import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { isLocalDate } from '../../domain/weeks.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { badRequest } from '../../util/errors.js';
import { getHistory } from './service.js';

const streakSchema = z.object({ current: z.number(), best: z.number() });
const historySchema = z
  .object({
    weeks: z.array(
      z.object({
        weekStart: z.string(),
        teamMet: z.boolean().nullable(),
        members: z.array(
          z.object({
            userId: z.string(),
            displayName: z.string(),
            isMe: z.boolean(),
            goalDays: z.number().nullable(),
            doneDays: z.number(),
            met: z.boolean().nullable(),
            debt: z
              .object({
                id: z.string(),
                redeemed: z.boolean(),
                role: z.enum(['debtor', 'creditor']),
              })
              .nullable(),
          }),
        ),
      }),
    ),
    streaks: z.object({ me: streakSchema, partner: streakSchema, team: streakSchema }),
    nextCursor: z.string().nullable(),
  })
  .openapi('History');

export function historyRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/history',
      tags: ['Historie'],
      summary: 'Vergangene Wochen mit Ergebnis beider Partner und Serien (neueste zuerst)',
      security: protectedSecurity,
      middleware: [requireAuth],
      request: {
        query: z.object({
          limit: z.coerce.number().int().min(1).max(52).default(12),
          before: z
            .string()
            .optional()
            .describe('Wochenstart (YYYY-MM-DD) aus nextCursor für die nächste Seite'),
        }),
      },
      responses: { 200: jsonResponse(historySchema, 'Historie'), ...errorResponses },
    }),
    (c) => {
      const { limit, before } = c.req.valid('query');
      if (before !== undefined && !isLocalDate(before)) {
        throw badRequest('invalid_cursor', 'Erwartet ein Datum im Format YYYY-MM-DD');
      }
      return c.json(getHistory(ctx, currentAuth(c).user, limit, before), 200);
    },
  );

  return app;
}
