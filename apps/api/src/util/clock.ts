/** Alle zeitabhängige Logik nutzt diese Abstraktion, nie direkt Date.now(). */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface FakeClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

export function createFakeClock(start: number | string | Date): FakeClock {
  let current = new Date(start).getTime();
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}
