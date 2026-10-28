import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { listNotifications, markRead } from './service.js';

const notificationSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.number(),
    read: z.boolean(),
  })
  .openapi('Notification');

export function notificationRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Benachrichtigungen'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/notifications',
      tags,
      summary: 'Postfach: Benachrichtigungen, neueste zuerst (funktioniert auch ohne Push)',
      ...auth,
      request: {
        query: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(30),
          unread: z.enum(['true', 'false']).default('false'),
          before: z.coerce
            .number()
            .int()
            .optional()
            .describe('createdAt der letzten bekannten Nachricht (Paginierung)'),
        }),
      },
      responses: {
        200: jsonResponse(
          z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }),
          'Postfach',
        ),
        ...errorResponses,
      },
    }),
    (c) => {
      const { limit, unread, before } = c.req.valid('query');
      return c.json(
        listNotifications(ctx, currentAuth(c).user, {
          limit,
          unreadOnly: unread === 'true',
          before,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/notifications/read',
      tags,
      summary: 'Als gelesen markieren (ohne ids: alle)',
      ...auth,
      request: {
        body: jsonBody(z.object({ ids: z.array(z.string().max(40)).max(200).optional() })),
      },
      responses: {
        200: jsonResponse(z.object({ marked: z.number() }), 'Markiert'),
        ...errorResponses,
      },
    }),
    (c) => c.json({ marked: markRead(ctx, currentAuth(c).user, c.req.valid('json').ids) }, 200),
  );

  return app;
}
