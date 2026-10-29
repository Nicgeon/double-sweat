import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  okSchema,
  protectedSecurity,
} from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';

const keysSchema = z.object({
  p256dh: z
    .string()
    .min(80)
    .max(100)
    .describe('Öffentlicher Schlüssel des Empfängers (base64url, 65 Byte)'),
  auth: z.string().min(20).max(30).describe('Auth-Geheimnis (base64url, 16 Byte)'),
});

const subscriptionInput = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('webpush'),
    endpoint: z.string().max(2048),
    keys: keysSchema,
    deviceLabel: z.string().max(80).optional(),
  }),
  z.object({
    provider: z.literal('unifiedpush'),
    endpoint: z.string().max(2048),
    keys: keysSchema
      .optional()
      .describe('Falls der Verteiler Schlüssel liefert, wird verschlüsselt gesendet'),
    deviceLabel: z.string().max(80).optional(),
  }),
  z.object({
    provider: z.literal('fcm'),
    endpoint: z.string().max(2048).describe('FCM-Registrierungstoken des Geräts'),
    keys: keysSchema.describe('Pflicht: Nachrichten laufen Ende-zu-Ende verschlüsselt über Google'),
    deviceLabel: z.string().max(80).optional(),
  }),
]);

const subscriptionSchema = z
  .object({
    id: z.string(),
    provider: z.enum(['webpush', 'unifiedpush', 'fcm']),
    deviceLabel: z.string().nullable(),
    createdAt: z.number(),
    lastSuccessAt: z.number().nullable(),
    failures: z.number(),
  })
  .openapi('PushSubscription');

export function pushRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Push'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/push/config',
      tags,
      summary: 'Welche Push-Anbieter der Server anbietet (und der öffentliche VAPID-Schlüssel)',
      ...auth,
      responses: {
        200: jsonResponse(
          z.object({
            webpush: z.object({ enabled: z.boolean(), publicKey: z.string().nullable() }),
            unifiedpush: z.object({ enabled: z.boolean() }),
            fcm: z.object({ enabled: z.boolean() }),
          }),
          'Konfiguration',
        ),
        ...errorResponses,
      },
    }),
    (c) => c.json(ctx.push.config(), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/push/subscriptions',
      tags,
      summary: 'Eigene registrierte Geräte',
      ...auth,
      responses: {
        200: jsonResponse(z.object({ subscriptions: z.array(subscriptionSchema) }), 'Geräte'),
        ...errorResponses,
      },
    }),
    (c) => c.json({ subscriptions: ctx.push.list(currentAuth(c).user) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/push/subscriptions',
      tags,
      summary: 'Gerät für Push registrieren (Web Push oder UnifiedPush)',
      description:
        'Das Ziel muss eine öffentlich erreichbare https-URL sein. Adressen im lokalen Netz sind nur für Hosts erlaubt, ' +
        'die der Betreiber in PUSH_ALLOWED_HOSTS freigegeben hat.',
      ...auth,
      request: { body: jsonBody(subscriptionInput) },
      responses: {
        201: jsonResponse(z.object({ subscription: subscriptionSchema }), 'Registriert'),
        ...errorResponses,
      },
    }),
    async (c) => {
      const subscription = await ctx.push.register(currentAuth(c).user, c.req.valid('json'));
      return c.json({ subscription }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/push/subscriptions/{id}',
      tags,
      summary: 'Gerät abmelden',
      ...auth,
      request: { params: z.object({ id: z.string().min(1).max(40) }) },
      responses: { 200: jsonResponse(okSchema, 'Entfernt'), ...errorResponses },
    }),
    (c) => {
      ctx.push.remove(currentAuth(c).user, c.req.valid('param').id);
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/push/test',
      tags,
      summary: 'Testbenachrichtigung an die eigenen Geräte senden',
      ...auth,
      responses: { 202: jsonResponse(okSchema, 'Wird zugestellt'), ...errorResponses },
    }),
    (c) => {
      ctx.push.sendTest(currentAuth(c).user);
      return c.json({ ok: true as const }, 202);
    },
  );

  return app;
}
