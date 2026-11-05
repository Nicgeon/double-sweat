import type { IconName } from '#lib/icons.ts';
import { reactionMeta } from './reactions.ts';

/** Eine Mitteilung im Postfach (Form der API). */
export type InboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  /** Pfad in der App, zu dem der Tipp führt */
  link: string | null;
  data: Record<string, unknown> | null;
};

export type DayGroup = {
  /** Kalendertag in der Zeitzone des Geräts (JJJJ-MM-TT) */
  key: string;
  kind: 'today' | 'yesterday' | 'date';
  items: InboxItem[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Kalendertag eines Zeitpunkts auf dem Gerät. */
export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Teilt die Mitteilungen (neueste zuerst) in Tage: Heute, Gestern, sonst das Datum. Die Reihenfolge bleibt erhalten. */
export function groupByDay(items: InboxItem[], now = Date.now()): DayGroup[] {
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 3600 * 1000);
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        kind: key === today ? 'today' : key === yesterday ? 'yesterday' : 'date',
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export type InboxTone = 'neutral' | 'done' | 'alert' | 'risk';

/** Symbol und Tönung einer Mitteilung. Die Tönung ist nie das Einzige, was sie ausmacht: Text und Symbol tragen es. */
export function inboxLook(
  type: string,
  data: Record<string, unknown> | null,
): { icon: IconName; tone: InboxTone } {
  switch (type) {
    case 'nudge':
      return { icon: 'hand', tone: 'neutral' };
    case 'reminder':
      return { icon: 'clock', tone: 'risk' };
    case 'checkin':
      return { icon: 'camera', tone: 'neutral' };
    case 'goal_reached':
    case 'reward_earned':
      return { icon: 'trophy', tone: 'done' };
    case 'reaction': {
      const meta = reactionMeta(typeof data?.kind === 'string' ? data.kind : undefined);
      return { icon: meta?.icon ?? 'heart-pulse', tone: 'neutral' };
    }
    case 'debt_created':
      return { icon: 'gift', tone: 'alert' };
    case 'debt_redeemed':
    case 'reward_received':
      return { icon: 'check', tone: 'done' };
    case 'bet_set':
    case 'bet_changed':
    case 'reward_set':
    case 'week_result':
      return { icon: 'target', tone: 'neutral' };
    case 'streak_milestone':
      return { icon: 'flame', tone: 'done' };
    case 'streak_broken':
      return { icon: 'flame', tone: 'alert' };
    case 'partner_joined':
      return { icon: 'users', tone: 'done' };
    case 'team_dissolved':
      return { icon: 'circle-x', tone: 'alert' };
    default:
      return { icon: 'bell', tone: 'neutral' };
  }
}
