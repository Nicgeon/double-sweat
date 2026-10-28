import type { LocalDate } from './weeks.js';

/** Ergebnis einer Woche: true = Ziel erreicht, false = verfehlt, null = nicht gewertet (z. B. kein Ziel gesetzt). */
export interface WeekOutcome {
  weekStart: LocalDate;
  met: boolean | null;
}

export interface Streak {
  /** Aufeinanderfolgende erreichte Wochen bis zur letzten gewerteten Woche. */
  current: number;
  best: number;
}

/**
 * Serie erreichter Wochen. Eine verfehlte Woche beendet die Serie, nicht gewertete Wochen (met = null)
 * werden übersprungen: Sie verlängern die Serie nicht, unterbrechen sie aber auch nicht.
 */
export function computeStreak(outcomes: WeekOutcome[]): Streak {
  const sorted = [...outcomes].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  let run = 0;
  let best = 0;
  for (const outcome of sorted) {
    if (outcome.met === true) {
      run++;
      best = Math.max(best, run);
    } else if (outcome.met === false) {
      run = 0;
    }
  }
  return { current: run, best };
}

/**
 * Team-Serie: Eine Woche zählt nur, wenn beide Partner gewertet wurden und beide ihr Ziel erreicht haben.
 * Hat einer verfehlt, bricht die Serie. Ist erst ein Partner abgerechnet (andere Zeitzone), wird die Woche
 * noch nicht berücksichtigt.
 */
export function computeTeamStreak(a: WeekOutcome[], b: WeekOutcome[]): Streak {
  const byWeekB = new Map(b.map((o) => [o.weekStart, o.met]));
  const combined: WeekOutcome[] = [];
  for (const outcome of a) {
    if (!byWeekB.has(outcome.weekStart)) continue;
    const other = byWeekB.get(outcome.weekStart) ?? null;
    if (outcome.met === false || other === false)
      combined.push({ weekStart: outcome.weekStart, met: false });
    else if (outcome.met === true && other === true)
      combined.push({ weekStart: outcome.weekStart, met: true });
    else combined.push({ weekStart: outcome.weekStart, met: null });
  }
  return computeStreak(combined);
}
