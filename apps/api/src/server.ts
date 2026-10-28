import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createContext } from './context.js';
import { openDatabase } from './db/client.js';
import { mountWeb } from './http/static.js';
import { runHousekeeping } from './jobs/housekeeping.js';
import { createPhotoSweeper } from './jobs/photo-sweeper.js';
import { startScheduler } from './jobs/scheduler.js';

function main(): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const db = openDatabase(config.dbPath);
  const ctx = createContext({ config, db });
  const app = createApp(ctx);
  if (config.webDir) mountWeb(app, config.webDir);

  const scheduler = startScheduler(ctx, [runHousekeeping, createPhotoSweeper()]);
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    ctx.log.info('listening', {
      address: info.address,
      port: info.port,
      signup: config.signupMode,
      mail: ctx.mailer.enabled,
      web: config.webDir !== null,
    });
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    ctx.log.info('shutting_down', { signal });
    scheduler.stop();
    server.close(() => {
      void ctx.idle().finally(() => {
        db.$client.close();
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
