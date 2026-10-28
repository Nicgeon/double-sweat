import { type Hook, OpenAPIHono } from '@hono/zod-openapi';
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
import { healthRoutes } from './modules/health/routes.js';
import { mailRoutes } from './modules/mail/routes.js';
import { meRoutes } from './modules/me/routes.js';
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

  api.use(
    '*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) =>
        c.json({ error: { code: 'payload_too_large', message: 'Anfrage zu groß' } }, 413),
    }),
  );
  api.use('*', authResolver(ctx));
  api.use('*', csrfGuard(ctx));

  api.route('/', healthRoutes(ctx));
  api.route('/', authRoutes(ctx));
  api.route('/', mailRoutes(ctx));
  api.route('/', meRoutes(ctx));
  api.route('/', teamRoutes(ctx));
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
