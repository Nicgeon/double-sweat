import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  okSchema,
  partnerColorSchema,
  protectedSecurity,
  teamSchema,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { clientIp } from '../../security/client-ip.js';
import { notFound } from '../../util/errors.js';
import { verifyReauth } from '../auth/service.js';
import {
  createInvite,
  createTeamForUser,
  dissolveTeam,
  getTeamView,
  joinTeamWithCode,
  peekInvite,
  revokeActiveInvite,
} from './service.js';

const teamResponse = jsonResponse(z.object({ team: teamSchema }), 'Team');

export function teamRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Team'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/invites/{code}',
      tags,
      summary: 'Vorschau einer Einladung (öffentlich, für die Beitrittsseite)',
      request: { params: z.object({ code: z.string().min(1).max(64) }) },
      responses: {
        200: jsonResponse(
          z.object({
            inviterName: z.string(),
            inviterColor: partnerColorSchema.nullable(),
            teamName: z.string(),
          }),
          'Einladung gültig',
        ),
        ...errorResponses,
      },
    }),
    (c) => c.json(peekInvite(ctx, clientIp(c, ctx.config), c.req.valid('param').code), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/teams',
      tags,
      summary: 'Neues Team gründen (für Konten ohne Team; es gelten die Regeln von SIGNUP_MODE)',
      ...auth,
      request: {
        body: jsonBody(
          z.object({
            name: z.string().trim().min(1).max(60).default('Unser Team'),
            setupToken: z.string().max(256).optional(),
          }),
        ),
      },
      responses: { 201: teamResponse, ...errorResponses },
    }),
    (c) => {
      const { user } = currentAuth(c);
      const { name, setupToken } = c.req.valid('json');
      createTeamForUser(ctx, user.id, name, setupToken);
      return c.json({ team: getTeamView(ctx, user.id)! }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/teams/join',
      tags,
      summary: 'Einem Team per Einladungscode beitreten (für Konten ohne Team)',
      ...auth,
      request: {
        body: jsonBody(
          z.object({
            code: z.string().min(1).max(64),
            color: partnerColorSchema
              .optional()
              .describe('Wunschfarbe; Standard ist die bisherige'),
          }),
        ),
      },
      responses: { 200: teamResponse, ...errorResponses },
    }),
    (c) => {
      const { user } = currentAuth(c);
      const { code, color } = c.req.valid('json');
      joinTeamWithCode(ctx, clientIp(c, ctx.config), user.id, code, color);
      return c.json({ team: getTeamView(ctx, user.id)! }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/team',
      tags,
      summary: 'Das eigene Team',
      ...auth,
      responses: { 200: teamResponse, ...errorResponses },
    }),
    (c) => {
      const team = getTeamView(ctx, currentAuth(c).user.id);
      if (!team) throw notFound('Du bist in keinem Team');
      return c.json({ team }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/team',
      tags,
      summary: 'Team auflösen (beide Konten bleiben bestehen, Teamdaten werden gelöscht)',
      ...auth,
      request: { body: jsonBody(z.object({ password: z.string().min(1).max(256) })) },
      responses: { 200: jsonResponse(okSchema, 'Team aufgelöst'), ...errorResponses },
    }),
    async (c) => {
      const { user } = currentAuth(c);
      await verifyReauth(ctx, user, c.req.valid('json').password);
      await dissolveTeam(ctx, user.id);
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/teams/invites',
      tags,
      summary:
        'Einladung erzeugen (ersetzt eine offene Einladung). Der Code wird nur einmal angezeigt.',
      ...auth,
      responses: {
        201: jsonResponse(
          z.object({ code: z.string(), joinUrl: z.string(), expiresAt: z.number() }),
          'Einladung',
        ),
        ...errorResponses,
      },
    }),
    (c) => c.json(createInvite(ctx, currentAuth(c).user.id), 201),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/teams/invites',
      tags,
      summary: 'Offene Einladung widerrufen',
      ...auth,
      responses: { 200: jsonResponse(okSchema, 'Widerrufen'), ...errorResponses },
    }),
    (c) => {
      revokeActiveInvite(ctx, currentAuth(c).user.id);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
