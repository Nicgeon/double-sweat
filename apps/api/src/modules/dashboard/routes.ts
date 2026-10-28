import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import {
  errorResponses,
  jsonResponse,
  partnerColorSchema,
  protectedSecurity,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { checkinSchema } from '../checkins/routes.js';
import { getDashboard } from './service.js';

const memberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  slot: z.number().describe('Platz im Team (1 Kreis, 2 Quadrat)'),
  color: partnerColorSchema,
  isMe: z.boolean(),
  timezone: z.string(),
  weekStart: z.string(),
  weekEndsAt: z.number(),
  goalDays: z.number().nullable(),
  doneDays: z.number(),
  checkedInToday: z.boolean(),
  remainingDays: z.number(),
  neededDays: z.number(),
  status: z.enum(['no_goal', 'done', 'on_track', 'at_risk', 'unreachable']),
  days: z.array(
    z.object({
      date: z.string(),
      checkedIn: z.boolean(),
      isToday: z.boolean(),
      isFuture: z.boolean(),
    }),
  ),
});

export function dashboardRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/dashboard',
      tags: ['Dashboard'],
      summary: 'Wochenfortschritt beider Partner (je in ihrer Zeitzone) und Foto-Feed der Woche',
      security: protectedSecurity,
      middleware: [requireAuth],
      responses: {
        200: jsonResponse(
          z.object({
            team: z.object({ id: z.string(), full: z.boolean() }),
            bet: z.string().nullable(),
            debts: z.object({ owe: z.number(), owed: z.number() }),
            members: z.array(memberSchema),
            feed: z.array(checkinSchema),
          }),
          'Dashboard',
        ),
        ...errorResponses,
      },
    }),
    (c) => c.json(getDashboard(ctx, currentAuth(c).user), 200),
  );

  return app;
}
