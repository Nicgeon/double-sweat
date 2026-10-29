import { Readable } from 'node:stream';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppContext } from '../../context.js';
import { isLocalDate, localDateAt, weekStartOf } from '../../domain/weeks.js';
import { currentAuth, requireAuth } from '../../http/middleware.js';
import { errorResponses, jsonResponse, okSchema, protectedSecurity } from '../../http/schemas.js';
import type { AppEnv } from '../../http/types.js';
import { AppError, badRequest } from '../../util/errors.js';
import { currentTimezone } from '../me/timezone.js';
import { reactionSchema } from '../reactions/routes.js';
import {
  CHECKIN_TAGS,
  type CheckinDto,
  createCheckin,
  deleteCheckin,
  listWeekCheckins,
  NOTE_MAX_LENGTH,
  openPhoto,
  PHOTO_VARIANTS,
} from './service.js';

const imageSchema = z.object({
  thumbUrl: z.string(),
  fullUrl: z.string(),
  width: z.number(),
  height: z.number(),
});

export const checkinSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string(),
    localDate: z.string(),
    weekStart: z.string(),
    tag: z.string().nullable(),
    note: z.string().nullable(),
    createdAt: z.number(),
    reactions: z.array(reactionSchema).describe('Reaktion des Partners (höchstens eine)'),
    photo: imageSchema,
    selfie: imageSchema
      .nullable()
      .describe('Optionales Selfie der Frontkamera zum selben Check-in'),
  })
  .openapi('Checkin');

export function checkinRoutes(ctx: AppContext): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const tags = ['Check-in'];
  const auth = { security: protectedSecurity, middleware: [requireAuth] };

  app.openapi(
    createRoute({
      method: 'post',
      path: '/checkins',
      tags,
      summary:
        'Check-in mit Foto für heute (bis zu 5 pro Tag, für das Wochenziel zählt der Tag einmal)',
      description:
        'Der Tag ergibt sich aus Serverzeit und der Zeitzone des Nutzers. Das Foto wird geprüft (JPEG, PNG oder WebP), ' +
        'auf höchstens 1600 px verkleinert und ohne Metadaten (EXIF/GPS) als JPEG gespeichert. ' +
        'Optional kann ein Selfie der Frontkamera (`selfie`) mitgeschickt werden; es wird genauso verarbeitet.',
      ...auth,
      request: {
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: z.object({
                photo: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
                selfie: z.instanceof(File).openapi({ type: 'string', format: 'binary' }).optional(),
                note: z.string().max(NOTE_MAX_LENGTH).optional(),
                tag: z.enum(CHECKIN_TAGS).optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: jsonResponse(z.object({ checkin: checkinSchema }), 'Check-in angelegt'),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { user } = currentAuth(c);
      const { photo, selfie, note, tag } = c.req.valid('form');
      // Das Größenlimit gilt je Bild; die Gesamtgrenze der Anfrage ist entsprechend größer
      for (const file of [photo, selfie]) {
        if (file && file.size > ctx.config.maxUploadBytes)
          throw new AppError(413, 'payload_too_large', 'Anfrage zu groß');
      }
      const checkin = await createCheckin(ctx, user, {
        photo: Buffer.from(await photo.arrayBuffer()),
        selfie: selfie ? Buffer.from(await selfie.arrayBuffer()) : undefined,
        note,
        tag,
      });
      return c.json({ checkin: checkin satisfies CheckinDto }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/checkins',
      tags,
      summary: 'Check-ins des Teams für eine Woche (Standard: laufende Woche)',
      ...auth,
      request: {
        query: z.object({
          week: z.string().optional().describe('Ein Datum der gewünschten Woche (YYYY-MM-DD)'),
        }),
      },
      responses: {
        200: jsonResponse(
          z.object({ weekStart: z.string(), checkins: z.array(checkinSchema) }),
          'Check-ins',
        ),
        ...errorResponses,
      },
    }),
    (c) => {
      const { user } = currentAuth(c);
      const { week } = c.req.valid('query');
      if (week !== undefined && !isLocalDate(week))
        throw badRequest('invalid_week', 'Erwartet ein Datum im Format YYYY-MM-DD');
      const weekStart = weekStartOf(
        week ?? localDateAt(ctx.clock.now(), currentTimezone(ctx, user)),
      );
      return c.json({ weekStart, checkins: listWeekCheckins(ctx, user, weekStart) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/checkins/{id}',
      tags,
      summary: 'Eigenen Check-in zurücknehmen (nur bis zum Ende seiner Woche)',
      ...auth,
      request: { params: z.object({ id: z.string().min(1).max(40) }) },
      responses: { 200: jsonResponse(okSchema, 'Gelöscht'), ...errorResponses },
    }),
    async (c) => {
      await deleteCheckin(ctx, currentAuth(c).user, c.req.valid('param').id);
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/photos/{checkinId}/{variant}',
      tags,
      summary: 'Foto oder Selfie eines Check-ins (nur für Mitglieder desselben Teams)',
      ...auth,
      request: {
        params: z.object({
          checkinId: z.string().min(1).max(40),
          variant: z.enum(PHOTO_VARIANTS),
        }),
      },
      responses: {
        200: {
          description: 'JPEG-Bild',
          content: {
            'image/jpeg': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
          },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const { checkinId, variant } = c.req.valid('param');
      const { stream, size } = await openPhoto(ctx, currentAuth(c).user, checkinId, variant);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(size),
          'Content-Disposition': 'inline',
          // Nur im Browser des angemeldeten Nutzers zwischenspeichern, nie in gemeinsamen Caches
          'Cache-Control': 'private, max-age=3600',
        },
      }) as never;
    },
  );

  return app;
}
