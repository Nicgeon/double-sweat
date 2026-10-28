export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;

  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = 'Nicht angemeldet') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (message = 'Nicht gefunden') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);

export function tooManyRequests(
  retryAfterSec: number,
  message = 'Zu viele Anfragen, bitte später erneut versuchen',
): AppError {
  return new AppError(429, 'rate_limited', message, {
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))),
  });
}
