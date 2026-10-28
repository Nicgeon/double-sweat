<script lang="ts">
  import type { PartnerColor } from '#lib/api/client.ts';
  import Icon from './Icon.svelte';

  export type DayState = 'done' | 'today' | 'missed' | 'future';
  type Props = { days: { label: string; state: DayState }[]; seat?: number; color?: PartnerColor };
  let { days, seat = 1, color }: Props = $props();
  const NAMES: Record<string, string> = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
  const STATE: Record<DayState, string> = { done: 'eingecheckt', today: 'heute, noch offen', missed: 'kein Check-in', future: 'kommt noch' };
</script>

<ol class="ds-week {seat === 2 ? 'ds-p2' : 'ds-p1'} {color ? `ds-c-${color}` : ''}">
  {#each days as d (d.label)}
    <li class="ds-day is-{d.state}" aria-current={d.state === 'today' ? 'date' : undefined}>
      <span class="ds-day__mark">{#if d.state === 'done'}<Icon name="check" size={18} strokeWidth={3} />{/if}</span>
      <span class="ds-day__label" aria-hidden="true">{d.label}</span>
      <span class="ds-sr">{NAMES[d.label] ?? d.label}: {STATE[d.state]}</span>
    </li>
  {/each}
</ol>
