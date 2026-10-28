<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PartnerColor } from '#lib/api/client.ts';
  import Avatar from './Avatar.svelte';
  import StatusChip from './StatusChip.svelte';
  import Streak from './Streak.svelte';
  import WeekStrip, { type DayState } from './WeekStrip.svelte';

  export type Lane = {
    slot: number;
    color: PartnerColor;
    name: string;
    you?: boolean;
    done: number;
    goal: number | null;
    status: 'done' | 'open' | 'risk' | 'missed';
    statusLabel?: string;
    days: { label: string; state: DayState }[];
  };
  type Props = { weekLabel: string; streak?: number; lanes: Lane[]; children?: Snippet };
  let { weekLabel, streak = 0, lanes, children }: Props = $props();
</script>

<section class="ds-board" aria-label="Anzeigetafel dieser Woche">
  <header class="ds-board__head">
    <span class="ds-overline">{weekLabel}</span>
    {#if streak > 0}<Streak weeks={streak} />{/if}
  </header>
  <div class="ds-board__lanes">
    {#each lanes as l (l.name + l.slot)}
      <article class="ds-lane {l.slot === 2 ? 'ds-p2' : 'ds-p1'} ds-c-{l.color}">
        <div class="ds-lane__top">
          <Avatar seat={l.slot} color={l.color} name={l.name} size="lg" />
          <div class="ds-lane__who">
            <span class="ds-lane__name">{l.name}{l.you ? ' (Du)' : ''}</span>
            <StatusChip status={l.status}>{#if l.statusLabel}{l.statusLabel}{/if}</StatusChip>
          </div>
          <div class="ds-lane__score">
            <span class="ds-num ds-lane__done" aria-hidden="true">{l.done}</span>
            <span class="ds-lane__goal" aria-hidden="true">{l.goal === null ? 'kein Ziel' : `von ${l.goal} Tagen`}</span>
            <span class="ds-sr">{l.goal === null ? `${l.done} Tage, kein Ziel gesetzt` : `${l.done} von ${l.goal} Tagen`}</span>
          </div>
        </div>
        <WeekStrip days={l.days} seat={l.slot} color={l.color} />
      </article>
    {/each}
  </div>
  {@render children?.()}
</section>
