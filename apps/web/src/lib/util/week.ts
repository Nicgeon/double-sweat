import type { DashboardMember } from '#lib/api/client.ts';
import type { Lane } from '#lib/components/Scoreboard.svelte';
import { t } from '#lib/i18n/index.svelte.ts';
import { dayLabel, dayName } from './format.ts';

const STATUS: Record<
  DashboardMember['status'],
  { status: Lane['status']; label?: 'status.unreachable' | 'status.noGoal' }
> = {
  done: { status: 'done' },
  on_track: { status: 'open' },
  at_risk: { status: 'risk' },
  unreachable: { status: 'missed', label: 'status.unreachable' },
  no_goal: { status: 'open', label: 'status.noGoal' },
};

/** Eine Person des Dashboards als Bahn der Anzeigetafel. */
export function laneOf(m: DashboardMember): Lane {
  const s = STATUS[m.status];
  return {
    slot: m.slot,
    color: m.color,
    name: m.displayName,
    you: m.isMe,
    done: m.doneDays,
    goal: m.goalDays ?? null,
    status: s.status,
    statusLabel: s.label ? t(s.label) : undefined,
    days: m.days.map((d, i) => ({
      label: dayLabel(i),
      name: dayName(i),
      state: d.checkedIn ? 'done' : d.isToday ? 'today' : d.isFuture ? 'future' : 'missed',
    })),
  };
}
