import type { HealthSession } from '#lib/native/plugins.ts';

/** Ein Check-in "gehört" zu einem Training, wenn er höchstens so viel vor dem Start … */
const BEFORE_MS = 60 * 60_000;
/** … oder so viel nach dem Ende liegt (Foto im Studio, Eintrag in Health Connect erst später). */
const AFTER_MS = 4 * 60 * 60_000;

/** Kalendertag ("2026-11-10") eines Zeitpunkts in der Zeitzone der Person; ohne gültige Zone der des Geräts. */
export function dateInZone(ms: number, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ms);
  }
}

/**
 * Welche Trainings aus Health Connect werden jetzt als Check-in vorgeschlagen?
 *
 * - Nur Trainings, die heute geendet haben (ein Check-in gilt immer für den heutigen Tag).
 * - Nicht die, die schon übernommen oder ausgeblendet wurden (`used`).
 * - Nicht die, für die schon ein Check-in da ist: Jeder eigene Check-in von heute (`checkins`, Zeitpunkte in ms)
 *   verbraucht höchstens ein Training, nämlich das zeitlich nächste in seinem Fenster. So hat jemand, der morgens
 *   gelaufen ist und abends Kraft gemacht hat, mit einem Check-in am Abend den Lauf noch offen.
 *
 * Das jüngste Training steht vorn. Das Übernehmen gehört in `used`, auch wenn der Check-in schon zählt: So verbraucht
 * ein übernommenes Training seinen Check-in und deckt nicht zusätzlich ein anderes zu.
 */
export function pendingSessions(input: {
  sessions: HealthSession[];
  used: string[];
  checkins: number[];
  today: string;
  timezone: string | undefined;
}): HealthSession[] {
  const todays = input.sessions.filter((s) => dateInZone(s.endMs, input.timezone) === input.today);
  const taken = new Set<string>();
  for (const at of [...input.checkins].sort((a, b) => a - b)) {
    let best: HealthSession | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const s of todays) {
      if (taken.has(s.id) || at < s.startMs - BEFORE_MS || at > s.endMs + AFTER_MS) continue;
      const distance = at < s.startMs ? s.startMs - at : Math.max(0, at - s.endMs);
      if (distance < bestDistance) {
        best = s;
        bestDistance = distance;
      }
    }
    if (best) taken.add(best.id);
  }
  return todays
    .filter((s) => !taken.has(s.id) && !input.used.includes(s.id))
    .sort((a, b) => b.endMs - a.endMs);
}
