import type { Dashboard } from '#lib/api/client.ts';
import { t, tn } from '#lib/i18n/index.svelte.ts';
import { NATIVE } from '#lib/native/flag.ts';
import { Widget } from '#lib/native/plugins.ts';
import { clockTime, weekLabel } from './format.ts';
import { laneOf } from './week.ts';

/** Buchstaben im Avatar: erste Buchstaben der ersten zwei Wörter, wie die Avatar-Komponente. */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase() || '?';

/**
 * Stand für die Startbildschirm-Widgets der Android-App. Alle Texte sind schon in der Sprache der Oberfläche; das
 * Widget holt nichts vom Server und braucht keine Zugangsdaten.
 */
export function buildWidgetSnapshot(dash: Dashboard, streak: number, now = Date.now()) {
  const members = [...dash.members].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const me = members.find((m) => m.isMe);
  return {
    updatedLabel: t('widget.updated', { time: clockTime(now) }),
    weekLabel: me ? weekLabel(me.weekStart) : '',
    streak,
    streakText: tn('streak.label', streak),
    todayDone: me?.checkedInToday ?? false,
    todayText: me?.checkedInToday ? t('widget.todayDone') : t('widget.todayOpen'),
    todayShort: me?.checkedInToday ? t('widget.todayDoneShort') : t('widget.todayOpenShort'),
    lanes: members.map(laneOf).map((lane) => ({
      name: lane.you ? t('common.nameYou', { name: lane.name }) : lane.name,
      initials: initialsOf(lane.name),
      slot: lane.slot,
      color: lane.color,
      progress:
        lane.goal === null
          ? t('scoreboard.noGoal')
          : tn('days.progress', lane.goal, { done: lane.done }),
      days: lane.days.map((d) => d.state),
    })),
  };
}

/** App: schreibt den aktuellen Stand für die Widgets. Fehler sind unkritisch (das Widget zeigt dann den alten Stand). */
export async function pushWidget(dash: Dashboard, streak: number): Promise<void> {
  if (!NATIVE) return;
  try {
    await Widget.update({ snapshot: JSON.stringify(buildWidgetSnapshot(dash, streak)) });
  } catch {
    /* nicht kritisch */
  }
}

/** App: leert die Widgets (Abmelden, Serverwechsel). */
export async function clearWidget(): Promise<void> {
  if (!NATIVE) return;
  try {
    await Widget.clear();
  } catch {
    /* nicht kritisch */
  }
}
