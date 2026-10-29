<script lang="ts">
  import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';
  import type { PartnerColor } from '#lib/api/client.ts';
  import Icon from './Icon.svelte';

  export type DayState = 'done' | 'today' | 'missed' | 'future';
  type Props = { days: { label: string; name?: string; state: DayState }[]; seat?: number; color?: PartnerColor };
  let { days, seat = 1, color }: Props = $props();
  const STATE: Record<DayState, MessageKey> = {
    done: 'day.state.done',
    today: 'day.state.today',
    missed: 'day.state.missed',
    future: 'day.state.future',
  };
</script>

<ol class="ds-week {seat === 2 ? 'ds-p2' : 'ds-p1'} {color ? `ds-c-${color}` : ''}">
  {#each days as d (d.label)}
    <li class="ds-day is-{d.state}" aria-current={d.state === 'today' ? 'date' : undefined}>
      <span class="ds-day__mark">{#if d.state === 'done'}<Icon name="check" size={18} strokeWidth={3} />{/if}</span>
      <span class="ds-day__label" aria-hidden="true">{d.label}</span>
      <span class="ds-sr">{d.name ?? d.label}: {t(STATE[d.state])}</span>
    </li>
  {/each}
</ol>
