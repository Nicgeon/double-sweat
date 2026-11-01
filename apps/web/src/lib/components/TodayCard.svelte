<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import type { DashboardMember } from '#lib/api/client.ts';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Props = { me: DashboardMember; partnerName?: string; firstTime?: boolean };
  let { me, partnerName, firstTime = false }: Props = $props();

  type View = { tone: 'open' | 'risk' | 'done' | 'alert'; icon: IconName; title: string; body: string };
  /** Der Status von heute in einem Satz: noch offen, zählt heute, geschafft. */
  const view = $derived.by((): View => {
    if (me.checkedInToday) {
      const parts: string[] = [];
      if (partnerName) parts.push(t('today.seen', { name: partnerName }));
      if (me.goalDays !== null) parts.push(me.neededDays > 0 ? tn('home.needed', me.neededDays) : t('today.goalReached'));
      return { tone: 'done', icon: 'circle-check', title: t('today.done'), body: parts.join(' ') };
    }
    if (me.status === 'unreachable') {
      return { tone: 'alert', icon: 'circle-x', title: t('today.open'), body: t('today.unreachable') };
    }
    const needed = me.neededDays > 0 ? tn('home.needed', me.neededDays) : '';
    if (me.status === 'at_risk') return { tone: 'risk', icon: 'timer', title: t('today.risk'), body: needed };
    return {
      tone: 'open',
      icon: 'clock',
      title: t('today.open'),
      body: needed || (firstTime ? t('today.firstOpen') : me.goalDays === null ? t('today.noGoal') : ''),
    };
  });
</script>

<section class="ds-today" aria-live="polite">
  <span class="ds-today__icon ds-today__icon--{view.tone}"><Icon name={view.icon} size={24} /></span>
  <div class="ds-today__text">
    <h2 class="ds-today__title">{view.title}</h2>
    {#if view.body}<p class="ds-today__body">{view.body}</p>{/if}
  </div>
</section>
