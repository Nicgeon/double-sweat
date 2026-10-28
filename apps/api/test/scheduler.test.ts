import { describe, expect, it } from 'vitest';
import { startScheduler } from '../src/jobs/scheduler.js';
import { createTestEnv } from './helpers.js';

describe('Scheduler', () => {
  it('führt alle Jobs aus und übersteht einen fehlschlagenden Job', async () => {
    const env = createTestEnv();
    const calls: string[] = [];
    const scheduler = startScheduler(
      env.ctx,
      [
        function erster() {
          calls.push('erster');
        },
        function kaputt() {
          throw new Error('Boom mit geheimen Daten');
        },
        async function dritter() {
          calls.push('dritter');
        },
      ],
      3_600_000,
    );
    await scheduler.tick();
    scheduler.stop();
    expect(calls).toContain('erster');
    expect(calls).toContain('dritter');
    const failure = env.logs.find((l) => l.includes('job_failed'));
    expect(failure).toContain('"job":"kaputt"');
    expect(failure).not.toContain('geheimen');
  });

  it('überspringt einen Tick, solange der vorige noch läuft', async () => {
    const env = createTestEnv();
    let running = 0;
    let maxParallel = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduler = startScheduler(
      env.ctx,
      [
        async function langsam() {
          running++;
          maxParallel = Math.max(maxParallel, running);
          await gate;
          running--;
        },
      ],
      3_600_000,
    );
    const second = scheduler.tick(); // der Start-Tick läuft noch → wird übersprungen
    release();
    await second;
    await scheduler.tick();
    scheduler.stop();
    expect(maxParallel).toBe(1);
  });
});
