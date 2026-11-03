<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { GuideStep } from '#lib/util/hint.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  type Props = { steps: GuideStep[]; oninvite: () => void };
  let { steps, oninvite }: Props = $props();
  const done = $derived(steps.filter((s) => s.done).length);
  const LABEL = { goal: 'guide.goal', bet: 'guide.bet', invite: 'guide.invite', checkin: 'guide.checkin' } as const;
  const DONE = { goal: 'guide.goalDone', bet: 'guide.betDone' } as const;
</script>

<section class="ds-guide" aria-labelledby="guide-title">
  <header class="ds-guide__head">
    <h2 class="ds-guide__title" id="guide-title">{t('guide.title')}</h2>
    <span class="ds-chip ds-chip--open">{t('guide.progress', { done, total: steps.length })}</span>
  </header>
  <ol class="ds-guide__list">
    {#each steps as s, i (s.id)}
      <li class="ds-guide__step {s.done ? 'is-done' : ''}">
        <span class="ds-guide__mark" aria-hidden="true">{#if s.done}<Icon name="check" size={16} strokeWidth={3} />{:else}{i + 1}{/if}</span>
        <span class="ds-guide__label">{s.done && (s.id === 'goal' || s.id === 'bet') ? t(DONE[s.id]) : t(LABEL[s.id])}{#if s.done}<span class="ds-sr"> ({t('status.done')})</span>{/if}</span>
        {#if !s.done}
          {#if s.id === 'goal'}<Button variant="secondary" size="sm" href="/deal#ziel">{t('guide.goalButton')}</Button>
          {:else if s.id === 'bet'}<Button variant="secondary" size="sm" href="/deal#einsatz">{t('guide.betButton')}</Button>
          {:else if s.id === 'invite'}<Button variant="secondary" size="sm" onclick={oninvite}>{t('guide.inviteButton')}</Button>
          {:else}<span class="ds-guide__hint">{t('guide.checkinHint')}</span>{/if}
        {/if}
      </li>
    {/each}
  </ol>
</section>
