import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { REACTION_KINDS, removeReaction, setReaction } from './service.js';

export const reactionSchema = z
  .object({
    kind: z.enum(REACTION_KINDS),
    userId: z.string(),
    displayName: z.string(),
  })
  .openapi('Reaction');

export function reactionRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Check-in'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };
  const idParam = z.object({ id: z.string().min(1).max(40) });
  const result = z.object({ reactions: z.array(reactionSchema) });

  app.openapi(
    createRoute({
      method: 'put',
      path: '/checkins/{id}/reaction',
      tags,
      summary:
        'Auf den Check-in des Partners reagieren (Flamme, Applaus, Stärke, Herz). Ersetzt die eigene frühere Reaktion.',
      ...auth,
      request: { params: idParam, body: jsonBody(z.object({ kind: z.enum(REACTION_KINDS) })) },
      responses: { 200: jsonResponse(result, 'Reaktionen des Check-ins'), ...errorResponses },
    }),
    (c) =>
      c.json(
        {
          reactions: setReaction(
            ctx,
            currentAuth(c).user,
            c.req.valid('param').id,
            c.req.valid('json').kind,
          ),
        },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/checkins/{id}/reaction',
      tags,
      summary: 'Eigene Reaktion zurücknehmen',
      ...auth,
      request: { params: idParam },
      responses: { 200: jsonResponse(result, 'Reaktionen des Check-ins'), ...errorResponses },
    }),
    (c) =>
      c.json({ reactions: removeReaction(ctx, currentAuth(c).user, c.req.valid('param').id) }, 200),
  );

  return app;
}
