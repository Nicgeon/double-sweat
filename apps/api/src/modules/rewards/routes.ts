import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import {
  getRewardOverview,
  listRewardClaims,
  REWARD_MAX_LENGTH,
  setClaimRedeemed,
  setReward,
} from './service.js';

const promiseSchema = z.object({
  current: z.string().nullable().describe('Gilt für die laufende Woche'),
  upcoming: z
    .object({ text: z.string().nullable(), effectiveFrom: z.string() })
    .nullable()
    .describe('Bereits beschlossene Änderung (text null = zurückgezogen)'),
});

const overviewSchema = z
  .object({
    mine: promiseSchema.describe('Was du deinem Partner verspricht'),
    partner: promiseSchema
      .extend({ displayName: z.string() })
      .nullable()
      .describe('Was dein Partner dir verspricht (null, solange du keinen Partner hast)'),
  })
  .openapi('RewardOverview');

const claimSchema = z
  .object({
    id: z.string(),
    weekStart: z.string(),
    rewardText: z.string().describe('Belohnung zum Zeitpunkt der Abrechnung'),
    createdAt: z.number(),
    redeemedAt: z.number().nullable(),
    direction: z
      .enum(['earned', 'give'])
      .describe('earned: du hast sie verdient, give: du schuldest sie'),
    recipientName: z.string(),
    giverName: z.string(),
  })
  .openapi('RewardClaim');

export function rewardRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Belohnung'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };
  const idParam = z.object({ id: z.string().min(1).max(40) });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/rewards',
      tags,
      summary: 'Belohnungen, die du und dein Partner einander für das Wochenziel versprechen',
      ...auth,
      responses: { 200: jsonResponse(overviewSchema, 'Versprechen'), ...errorResponses },
    }),
    (c) => c.json(getRewardOverview(ctx, currentAuth(c).user), 200),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/rewards',
      tags,
      summary:
        'Belohnung für den Partner festlegen (leer = zurückziehen). Sie gilt erst für Wochen, die noch bei keinem Partner begonnen haben.',
      ...auth,
      request: { body: jsonBody(z.object({ text: z.string().trim().max(REWARD_MAX_LENGTH) })) },
      responses: { 200: jsonResponse(overviewSchema, 'Gesetzt'), ...errorResponses },
    }),
    (c) => c.json(setReward(ctx, currentAuth(c).user, c.req.valid('json').text), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/reward-claims',
      tags,
      summary: 'Verdiente Belohnungen im Team (Standard: offene)',
      ...auth,
      request: { query: z.object({ status: z.enum(['open', 'redeemed', 'all']).default('open') }) },
      responses: {
        200: jsonResponse(z.object({ claims: z.array(claimSchema) }), 'Belohnungen'),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json(
        { claims: listRewardClaims(ctx, currentAuth(c).user, c.req.valid('query').status) },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/reward-claims/{id}/redeem',
      tags,
      summary: 'Belohnung als erhalten markieren (nur durch die Person, die sie verdient hat)',
      ...auth,
      request: { params: idParam },
      responses: {
        200: jsonResponse(z.object({ claim: claimSchema }), 'Erhalten'),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json(
        { claim: setClaimRedeemed(ctx, currentAuth(c).user, c.req.valid('param').id, true) },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/reward-claims/{id}/redeem',
      tags,
      summary: 'Markierung zurücknehmen (nur durch die Person, die sie verdient hat)',
      ...auth,
      request: { params: idParam },
      responses: {
        200: jsonResponse(z.object({ claim: claimSchema }), 'Wieder offen'),
        ...errorResponses,
      },
    }),
    (c) =>
      c.json(
        { claim: setClaimRedeemed(ctx, currentAuth(c).user, c.req.valid('param').id, false) },
        200,
      ),
  );

  return app;
}
