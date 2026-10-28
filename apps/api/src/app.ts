import { type Hook, OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { AppContext } from './context.js';
import {
  authResolver,
  csrfGuard,
  handleError,
  requestLogger,
  securityHeaders,
} from './http/middleware.js';
import type { AppEnv } from './http/types.js';
import { authRoutes } from './modules/auth/routes.js';
import { betRoutes } from './modules/bets/routes.js';
import { checkinRoutes } from './modules/checkins/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { debtRoutes } from './modules/debts/routes.js';
import { goalRoutes } from './modules/goals/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { historyRoutes } from './modules/history/routes.js';
import { mailRoutes } from './modules/mail/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { nudgeRoutes } from './modules/nudges/routes.js';
import { pushRoutes } from './modules/push/routes.js';
import { teamRoutes } from './modules/teams/routes.js';
import { APP_VERSION } from './version.js';

// Einheitliches Fehlerformat bei fehlgeschlagener Validierung
// biome-ignore lint/suspicious/noExplicitAny: Hook-Typ der Bibliothek ist generisch
const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Ungültige Eingabe',
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400,
    );
  }
};

export function createApp(ctx: AppContext): OpenAPIHono<AppEnv> {
  const root = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

  root.use('*', securityHeaders(ctx));
  root.use(
    '/api/*',
    cors({
      origin: (origin) => (ctx.config.corsAppOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      exposeHeaders: ['Retry-After'],
      maxAge: 600,
    }),
  );
  root.use('*', requestLogger(ctx));

  const tooLarge = (c: Context) =>
    c.json({ error: { code: 'payload_too_large', message: 'Anfrage zu groß' } }, 413);
  const smallBody = bodyLimit({ maxSize: 64 * 1024, onError: tooLarge });
  // Foto-Uploads dürfen größer sein, alles andere ist reines JSON
  const uploadBody = bodyLimit({
    maxSize: ctx.config.maxUploadBytes + 64 * 1024,
    onError: tooLarge,
  });
  api.use('*', (c, next) =>
    c.req.method === 'POST' && c.req.path === '/api/v1/checkins'
      ? uploadBody(c, next)
      : smallBody(c, next),
  );
  api.use('*', authResolver(ctx));
  api.use('*', csrfGuard(ctx));

  api.route('/', healthRoutes(ctx));
  api.route('/', authRoutes(ctx));
  api.route('/', mailRoutes(ctx));
  api.route('/', meRoutes(ctx));
  api.route('/', teamRoutes(ctx));
  api.route('/', goalRoutes(ctx));
  api.route('/', checkinRoutes(ctx));
  api.route('/', dashboardRoutes(ctx));
  api.route('/', betRoutes(ctx));
  api.route('/', debtRoutes(ctx));
  api.route('/', historyRoutes(ctx));
  api.route('/', pushRoutes(ctx));
  api.route('/', notificationRoutes(ctx));
  api.route('/', nudgeRoutes(ctx));
  root.route('/api/v1', api);

  root.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'ds_session',
    description:
      'Web: Session-Cookie. Unsichere Methoden brauchen zusätzlich den Header X-CSRF-Token.',
  });
  root.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'App: Access-Token aus /auth/token bzw. /auth/refresh.',
  });
  root.doc('/api/v1/openapi.json', {
    openapi: '3.0.3',
    info: {
      title: 'Double Sweat API',
      version: APP_VERSION,
      description: 'REST/JSON-API der selbst gehosteten Paar-Fitness-Accountability-App.',
    },
    servers: [{ url: ctx.config.publicOrigin }],
  });

  root.notFound((c) => c.json({ error: { code: 'not_found', message: 'Nicht gefunden' } }, 404));
  root.onError(handleError(ctx));
  return root;
}
