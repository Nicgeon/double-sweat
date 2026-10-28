import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../context.js';
import { lookupAccessToken } from '../modules/auth/app-tokens.js';
import { lookupSession } from '../modules/auth/sessions.js';
import { safeEqual } from '../security/tokens.js';
import { AppError, forbidden, unauthorized } from '../util/errors.js';
import type { AppEnv } from './types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const sessionCookieName = (ctx: AppContext) =>
  ctx.config.secureCookies ? '__Host-ds_session' : 'ds_session';

/** Sicherheits-Header für alle Antworten. Die API liefert nur JSON, daher eine restriktive CSP. */
export function securityHeaders(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('X-Frame-Options', 'DENY');
    h.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (ctx.config.secureCookies)
      h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (c.req.path.startsWith('/api/')) {
      h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (!h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
    }
  };
}

export function requestLogger(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    await next();
    // routePath statt der echten URL: Tokens und Codes in Pfaden landen nie im Log.
    const level = c.req.routePath.endsWith('/health') ? 'debug' : 'info';
    ctx.log[level]('request', {
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    });
  };
}

/** Ermittelt Cookie- oder Bearer-Anmeldung. Setzt auth auf null, wenn keine gültige vorliegt. */
export function authResolver(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('auth', null);
    const header = c.req.header('authorization');
    if (header !== undefined) {
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      const found = match?.[1] ? lookupAccessToken(ctx, match[1]) : null;
      if (found) c.set('auth', { kind: 'bearer', user: found.user, familyId: found.row.familyId });
    } else {
      const cookie = getCookie(c, sessionCookieName(ctx));
      const found = cookie ? lookupSession(ctx, cookie) : null;
      if (found) {
        c.set('auth', {
          kind: 'cookie',
          user: found.user,
          sessionId: found.session.id,
          csrfToken: found.session.csrfToken,
        });
      }
    }
    await next();
  };
}

/**
 * CSRF-Schutz für zustandsändernde Anfragen:
 * 1. Ein vorhandener Origin muss zu PUBLIC_URL oder einer konfigurierten App-Origin gehören.
 * 2. Bei Cookie-Anmeldung muss der Origin exakt PUBLIC_URL sein und der Header X-CSRF-Token zur Session passen.
 * Bearer-Anfragen sind ausgenommen, sie tragen keine automatisch gesendeten Zugangsdaten.
 */
export function csrfGuard(ctx: AppContext): MiddlewareHandler<AppEnv> {
  const allowed = new Set([ctx.config.publicOrigin, ...ctx.config.corsAppOrigins]);
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const origin = c.req.header('origin');
    const fetchSite = c.req.header('sec-fetch-site');
    if (origin !== undefined) {
      if (!allowed.has(origin))
        throw forbidden('csrf_origin', 'Anfrage von nicht erlaubtem Ursprung');
    } else if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
      throw forbidden('csrf_origin', 'Anfrage von nicht erlaubtem Ursprung');
    }

    const auth = c.get('auth');
    if (auth?.kind === 'cookie') {
      if (origin !== ctx.config.publicOrigin)
        throw forbidden('csrf_origin', 'Anfrage von nicht erlaubtem Ursprung');
      const token = c.req.header('x-csrf-token');
      if (!token || !safeEqual(token, auth.csrfToken))
        throw forbidden('csrf_token', 'CSRF-Token fehlt oder ist ungültig');
    }
    return next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('auth')) throw unauthorized();
  await next();
};

export function currentAuth(c: Context<AppEnv>) {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  return auth;
}

export function handleError(ctx: AppContext) {
  return (error: Error, c: Context): Response => {
    if (error instanceof AppError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status as 400,
        error.headers,
      );
    }
    if (error instanceof HTTPException) {
      const status = error.status;
      return c.json(
        {
          error: {
            code: status === 413 ? 'payload_too_large' : 'bad_request',
            message: error.message || 'Fehlerhafte Anfrage',
          },
        },
        status,
      );
    }
    ctx.log.error('unhandled_error', { error: error.name, message: error.message });
    return c.json({ error: { code: 'internal_error', message: 'Interner Fehler' } }, 500);
  };
}
