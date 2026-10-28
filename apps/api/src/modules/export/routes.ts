import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonBody, jsonResponse, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { clientIp } from '../../security/client-ip.js';
import { openExport, requestExport } from './service.js';

export function exportRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Datenexport'];

  app.openapi(
    createRoute({
      method: 'post',
      path: '/me/export',
      tags,
      summary:
        'Datenexport anfordern (Passwort nötig): liefert einen Einmal-Download-Link, 60 Sekunden gültig',
      security: protectedSecurity,
      middleware: [requireAuth],
      request: { body: jsonBody(z.object({ password: z.string().min(1).max(256) })) },
      responses: {
        201: jsonResponse(
          z.object({ token: z.string(), expiresAt: z.number(), downloadUrl: z.string() }),
          'Download-Berechtigung',
        ),
        ...errorResponses,
      },
    }),
    async (c) =>
      c.json(await requestExport(ctx, currentAuth(c).user, c.req.valid('json').password), 201),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/export/{token}',
      tags,
      summary:
        'Export als ZIP herunterladen: data.json und alle eigenen Fotos. Das Token ist die Berechtigung, es braucht keine Sitzung.',
      request: { params: z.object({ token: z.string().min(10).max(200) }) },
      responses: {
        200: {
          description: 'ZIP-Archiv',
          content: {
            'application/zip': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
          },
        },
        ...errorResponses,
      },
    }),
    (c) => {
      const { stream, filename } = openExport(
        ctx,
        clientIp(c, ctx.config),
        c.req.valid('param').token,
      );
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      }) as never;
    },
  );

  return app;
}
