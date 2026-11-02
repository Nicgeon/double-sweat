import type { Dashboard } from '#lib/api/client.ts';

/**
 * Welcher Hinweis steht auf der Heute-Seite? Höchstens einer, nach Priorität:
 * Einlösungen, die auf dich warten, vor dem Hinweis, dass dein Ziel erst ab Montag gilt.
 * Fehlen Ziel oder Partner, übernimmt die Starthilfe (siehe `startGuide`).
 */
export type Hint =
  | { kind: 'open'; count: number }
  | { kind: 'goalNext'; days: number; weekStart: string }
  | null;

export function pickHint(d: Dashboard): Hint {
  const me = d.members.find((m) => m.isMe);
  if (!me) return null;
  const open = d.debts.owed + d.rewards.earned;
  if (open > 0) return { kind: 'open', count: open };
  if (me.goalDays === null && me.nextGoalDays !== null) {
    return { kind: 'goalNext', days: me.nextGoalDays, weekStart: me.weekStart };
  }
  return null;
}

export type GuideStep = { id: 'goal' | 'bet' | 'invite' | 'checkin'; done: boolean };

/** Fehlt der Einsatz (weder gültig noch vorgemerkt)? Er ist Pflicht: ohne ihn zählt keine Woche. */
export const betMissing = (d: Dashboard): boolean => d.bet === null && d.betUpcoming === null;

/**
 * Starthilfe für neue Konten: Wochenziel setzen, Einsatz festlegen (Pflicht), Partner einladen, ersten
 * Check-in machen. Sie erscheint, solange Ziel, Einsatz oder Partner fehlen, und verschwindet danach (der
 * Check-in ist kein Muss).
 */
export function startGuide(d: Dashboard): { steps: GuideStep[]; visible: boolean } | null {
  const me = d.members.find((m) => m.isMe);
  if (!me) return null;
  const goalDone = me.goalDays !== null || me.nextGoalDays !== null;
  const betDone = !betMissing(d);
  const inviteDone = d.team.full;
  const checkinDone = d.feed.some((c) => c.userId === me.userId);
  return {
    steps: [
      { id: 'goal', done: goalDone },
      { id: 'bet', done: betDone },
      { id: 'invite', done: inviteDone },
      { id: 'checkin', done: checkinDone },
    ],
    visible: !goalDone || !betDone || !inviteDone,
  };
}
