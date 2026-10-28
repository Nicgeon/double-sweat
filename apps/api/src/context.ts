import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { createMailer, type Mailer } from './modules/mail/mailer.js';
import { createPhotoStorage, type PhotoStorage } from './modules/photos/storage.js';
import { createPushService, type PushService } from './modules/push/service.js';
import { createPasswordHasher, type PasswordHasher } from './security/passwords.js';
import { createRateLimiter, type RateLimiter } from './security/ratelimit.js';
import { createSafeFetch, type SafeFetch } from './security/safe-fetch.js';
import { type Clock, systemClock } from './util/clock.js';
import { createLogger, type Logger } from './util/logger.js';

export interface AppContext {
  config: Config;
  db: Db;
  clock: Clock;
  log: Logger;
  mailer: Mailer;
  photos: PhotoStorage;
  /** Einziger Weg für ausgehende Anfragen an vom Nutzer gelieferte Ziele (Push-Endpunkte). */
  safeFetch: SafeFetch;
  push: PushService;
  passwords: PasswordHasher;
  limiter: RateLimiter;
  /** Wartezeiten zwischen Mail-Versuchen (Backoff). In Tests auf [0, 0] setzen. */
  mailRetryDelaysMs: number[];
  /** Führt Arbeit nach dem Senden der Antwort aus (Antwortzeit verrät nichts). */
  defer(task: () => Promise<void> | void): void;
  /** Wartet, bis alle zurückgestellten Aufgaben fertig sind (für Tests und sauberes Beenden). */
  idle(): Promise<void>;
}

export interface ContextOptions {
  config: Config;
  db: Db;
  clock?: Clock;
  log?: Logger;
  mailer?: Mailer;
  photos?: PhotoStorage;
  safeFetch?: SafeFetch;
  passwords?: PasswordHasher;
  mailRetryDelaysMs?: number[];
}

export function createContext(options: ContextOptions): AppContext {
  const { config, db } = options;
  const clock = options.clock ?? systemClock;
  const log = options.log ?? createLogger(config.logLevel);
  const pending = new Set<Promise<void>>();

  const base: Omit<AppContext, 'push'> = {
    config,
    db,
    clock,
    log,
    mailer: options.mailer ?? createMailer(config),
    photos: options.photos ?? createPhotoStorage(config.photosDir),
    safeFetch: options.safeFetch ?? createSafeFetch({ allowedHosts: config.push.allowedHosts }),
    passwords: options.passwords ?? createPasswordHasher(config.argon2),
    limiter: createRateLimiter(db, clock),
    mailRetryDelaysMs: options.mailRetryDelaysMs ?? [1_000, 5_000],
    defer(task) {
      const promise = (async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        try {
          await task();
        } catch (error) {
          log.error('background_task_failed', {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
      })();
      pending.add(promise);
      void promise.finally(() => pending.delete(promise));
    },
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
  // push braucht den Kontext selbst (Datenbank, Uhr, Hintergrundaufgaben) und wird deshalb zuletzt gesetzt
  const ctx = base as AppContext; // push folgt unmittelbar
  ctx.push = createPushService(ctx);
  return ctx;
}
