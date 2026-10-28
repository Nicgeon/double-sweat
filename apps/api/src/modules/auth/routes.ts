import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { AppContext } from '../../context.js';
import { appTokens, sessions, type User } from '../../db/schema.js';
import { currentAuth, requireAuth, sessionCookieName } from '../../http/middleware.js';
import {
  authResultSchema,
  errorResponses,
  jsonBody,
  jsonResponse,
  okSchema,
  protectedSecurity,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { clientIp } from '../../security/client-ip.js';
import { notFound } from '../../util/errors.js';
import { resetPassword } from '../mail/service.js';
import { getTeamView } from '../teams/service.js';
import { issueTokenPair, refreshTokenPair, revokeFamily } from './app-tokens.js';
import {
  authenticate,
  changePassword,
  passwordSchema,
  registerAccount,
  toUserDto,
} from './service.js';
import { createSession, deleteSession } from './sessions.js';

const emailField = z.email().max(254);
const clientField = z
  .enum(['web', 'app'])
  .default('web')
  .describe('web: Session-Cookie, app: Bearer-Tokens');

function respondWithLogin(
  c: Context<AppEnv>,
  ctx: AppContext,
  user: User,
  client: 'web' | 'app',
  deviceLabel: string | undefined,
) {
  const team = getTeamView(ctx, user.id);
  if (client === 'app') {
    const { familyId: _familyId, ...tokens } = issueTokenPair(ctx, user.id, deviceLabel);
    return { user: toUserDto(user), team, tokens };
  }
  const session = createSession(ctx, user.id, c.req.header('user-agent'));
  setCookie(c, sessionCookieName(ctx), session.token, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: session.maxAgeSec,
  });
  return { user: toUserDto(user), team, csrfToken: session.csrfToken };
}

export function authRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Auth'];

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/register',
      tags,
      summary: 'Konto anlegen (per Einladungscode oder als Gründung eines neuen Teams)',
      request: {
        body: jsonBody(
          z.object({
            email: emailField,
            password: passwordSchema,
            displayName: z.string().trim().min(1).max(40),
            timezone: z.string().min(1).max(64).describe('IANA-Zeitzone, z. B. Europe/Berlin'),
            inviteCode: z.string().max(64).optional(),
            setupToken: z
              .string()
              .max(256)
              .optional()
              .describe('Nur nötig bei SIGNUP_MODE=token und ohne Einladung'),
            teamName: z.string().trim().min(1).max(60).optional(),
            client: clientField,
            deviceLabel: z.string().max(80).optional(),
          }),
        ),
      },
      responses: {
        201: jsonResponse(authResultSchema, 'Konto angelegt und angemeldet'),
        ...errorResponses,
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const { user } = await registerAccount(ctx, clientIp(c, ctx.config), body);
      return c.json(respondWithLogin(c, ctx, user, body.client, body.deviceLabel), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/login',
      tags,
      summary: 'Anmelden mit Session-Cookie (Web)',
      request: {
        body: jsonBody(z.object({ email: emailField, password: z.string().min(1).max(256) })),
      },
      responses: { 200: jsonResponse(authResultSchema, 'Angemeldet'), ...errorResponses },
    }),
    async (c) => {
      const { email, password } = c.req.valid('json');
      const user = await authenticate(ctx, clientIp(c, ctx.config), email, password);
      return c.json(respondWithLogin(c, ctx, user, 'web', undefined), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/token',
      tags,
      summary: 'Anmelden mit Bearer-Tokens (App)',
      request: {
        body: jsonBody(
          z.object({
            email: emailField,
            password: z.string().min(1).max(256),
            deviceLabel: z.string().max(80).optional(),
          }),
        ),
      },
      responses: { 200: jsonResponse(authResultSchema, 'Angemeldet'), ...errorResponses },
    }),
    async (c) => {
      const { email, password, deviceLabel } = c.req.valid('json');
      const user = await authenticate(ctx, clientIp(c, ctx.config), email, password);
      return c.json(respondWithLogin(c, ctx, user, 'app', deviceLabel), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/refresh',
      tags,
      summary: 'Token-Paar erneuern (Rotation mit Wiederverwendungserkennung)',
      request: { body: jsonBody(z.object({ refreshToken: z.string().min(10).max(200) })) },
      responses: { 200: jsonResponse(authResultSchema, 'Neues Token-Paar'), ...errorResponses },
    }),
    async (c) => {
      const { refreshToken } = c.req.valid('json');
      const { user, familyId: _familyId, ...tokens } = refreshTokenPair(ctx, refreshToken);
      return c.json({ user: toUserDto(user), team: getTeamView(ctx, user.id), tokens }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/logout',
      tags,
      summary: 'Abmelden (Session beenden bzw. Token-Familie widerrufen)',
      security: protectedSecurity,
      middleware: [requireAuth],
      responses: { 200: jsonResponse(okSchema, 'Abgemeldet'), ...errorResponses },
    }),
    (c) => {
      const auth = currentAuth(c);
      if (auth.kind === 'cookie') {
        deleteSession(ctx, auth.sessionId, auth.user.id);
        deleteCookie(c, sessionCookieName(ctx), { path: '/', secure: ctx.config.secureCookies });
      } else {
        revokeFamily(ctx, auth.familyId, auth.user.id);
      }
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/auth/sessions',
      tags,
      summary: 'Angemeldete Geräte und Sitzungen',
      security: protectedSecurity,
      middleware: [requireAuth],
      responses: {
        200: jsonResponse(
          z.object({
            sessions: z.array(
              z.object({
                id: z.string(),
                kind: z.enum(['web', 'app']),
                label: z.string().nullable(),
                createdAt: z.number(),
                lastSeenAt: z.number(),
                current: z.boolean(),
              }),
            ),
          }),
          'Liste',
        ),
        ...errorResponses,
      },
    }),
    (c) => {
      const auth = currentAuth(c);
      const now = ctx.clock.now();
      const web = ctx.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, auth.user.id),
            gt(sessions.idleExpiresAt, now),
            gt(sessions.absExpiresAt, now),
          ),
        )
        .all()
        .map((s) => ({
          id: s.id,
          kind: 'web' as const,
          label: s.userAgent,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          current: auth.kind === 'cookie' && auth.sessionId === s.id,
        }));
      const app = ctx.db
        .select()
        .from(appTokens)
        .where(
          and(
            eq(appTokens.userId, auth.user.id),
            isNull(appTokens.revokedAt),
            isNull(appTokens.rotatedAt),
            gt(appTokens.refreshExpires, now),
          ),
        )
        .all()
        .map((t) => ({
          id: t.familyId,
          kind: 'app' as const,
          label: t.deviceLabel,
          createdAt: t.createdAt,
          lastSeenAt: t.lastUsedAt,
          current: auth.kind === 'bearer' && auth.familyId === t.familyId,
        }));
      return c.json(
        { sessions: [...web, ...app].sort((a, b) => b.lastSeenAt - a.lastSeenAt) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/auth/sessions/{id}',
      tags,
      summary: 'Sitzung oder Gerät abmelden',
      security: protectedSecurity,
      middleware: [requireAuth],
      request: { params: z.object({ id: z.string().min(1).max(64) }) },
      responses: { 200: jsonResponse(okSchema, 'Beendet'), ...errorResponses },
    }),
    (c) => {
      const auth = currentAuth(c);
      const { id } = c.req.valid('param');
      const removed = deleteSession(ctx, id, auth.user.id) || revokeFamily(ctx, id, auth.user.id);
      if (!removed) throw notFound('Sitzung nicht gefunden');
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/change-password',
      tags,
      summary: 'Passwort ändern (beendet alle anderen Sitzungen)',
      security: protectedSecurity,
      middleware: [requireAuth],
      request: {
        body: jsonBody(
          z.object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema }),
        ),
      },
      responses: { 200: jsonResponse(okSchema, 'Geändert'), ...errorResponses },
    }),
    async (c) => {
      const auth = currentAuth(c);
      const { currentPassword, newPassword } = c.req.valid('json');
      await changePassword(ctx, auth.user, currentPassword, newPassword, {
        sessionId: auth.kind === 'cookie' ? auth.sessionId : undefined,
        familyId: auth.kind === 'bearer' ? auth.familyId : undefined,
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  // Immer verfügbar: Reset-Links können auch per CLI erzeugt werden (ohne SMTP).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/reset-password',
      tags,
      summary: 'Neues Passwort mit Reset-Token setzen',
      request: {
        body: jsonBody(
          z.object({ token: z.string().min(10).max(200), newPassword: passwordSchema }),
        ),
      },
      responses: {
        200: jsonResponse(okSchema, 'Passwort gesetzt, alle Sitzungen beendet'),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { token, newPassword } = c.req.valid('json');
      await resetPassword(ctx, clientIp(c, ctx.config), token, newPassword);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
