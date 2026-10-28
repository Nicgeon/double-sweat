import type { DashboardMember } from '#lib/api/client.ts';
import type { Lane } from '#lib/components/Scoreboard.svelte';
import { DAY_LABELS } from './format';

const STATUS: Record<DashboardMember['status'], { status: Lane['status']; label?: string }> = {
  done: { status: 'done' },
  on_track: { status: 'open' },
  at_risk: { status: 'risk' },
  unreachable: { status: 'missed', label: 'Nicht mehr erreichbar' },
  no_goal: { status: 'open', label: 'Kein Ziel' },
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
    statusLabel: s.label,
    days: m.days.map((d, i) => ({
      label: DAY_LABELS[i] ?? '',
      state: d.checkedIn ? 'done' : d.isToday ? 'today' : d.isFuture ? 'future' : 'missed',
    })),
  };
}
