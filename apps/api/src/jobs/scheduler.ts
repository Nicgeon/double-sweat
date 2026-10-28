import type { AppContext } from '../context.js';

export type Job = (ctx: AppContext) => void | Promise<void>;

export interface Scheduler {
  stop(): void;
  /** Führt alle Jobs einmal aus (für Tests und den Start). */
  tick(): Promise<void>;
}

/**
 * Einfacher In-Process-Scheduler. Jobs müssen idempotent sein; ein Tick überspringt sich selbst,
 * solange der vorige noch läuft. Es darf nur eine API-Instanz laufen.
 */
export function startScheduler(ctx: AppContext, jobs: Job[], intervalMs = 60_000): Scheduler {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const job of jobs) {
        try {
          await job(ctx);
        } catch (error) {
          ctx.log.error('job_failed', {
            job: job.name,
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return { stop: () => clearInterval(timer), tick };
}
