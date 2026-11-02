<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import Avatar from './Avatar.svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import type { Lane } from './Scoreboard.svelte';
  import Streak from './Streak.svelte';
  import { weekdayDate } from '#lib/util/format.ts';
  import WeekStrip from './WeekStrip.svelte';

  type Props = {
    weekLabel: string;
    streak?: number;
    lanes: Lane[];
    /** Es gibt noch keine zweite Person im Team (Platzhalter statt Bahn). */
    partnerMissing?: boolean;
    /** Name der anderen Person, wenn sie heute schon eingecheckt hat (Zeile "… hat heute eingecheckt"). */
    checkedPartner?: string;
    nudgeName?: string;
    nudging?: boolean;
    nudgeMessage?: { tone: 'success' | 'info'; text: string } | null;
    bet: string | null;
    /** Einsatz, der erst ab einem späteren Montag gilt (nur relevant, solange `bet` fehlt). */
    betUpcoming?: { text: string; effectiveFrom: string } | null;
    onview?: () => void;
    onnudge?: () => void;
  };
  let { weekLabel, streak = 0, lanes, partnerMissing = false, checkedPartner, nudgeName, nudging = false, nudgeMessage = null, bet, betUpcoming = null, onview, onnudge }: Props = $props();

  const progress = (l: Lane) =>
    l.goal === null ? (l.done > 0 ? tn('week.noGoalDays', l.done) : t('scoreboard.noGoal')) : tn('days.progress', l.goal, { done: l.done });
</script>

<section class="ds-weekcard" aria-label={t('scoreboard.label')}>
  <header class="ds-weekcard__head">
    <span class="ds-overline">{weekLabel}</span>
    {#if streak > 0}<a class="ds-weekcard__streak" href="/history"><Streak weeks={streak} /></a>{/if}
  </header>

  {#each lanes as l (l.name + l.slot)}
    <div class="ds-wlane {l.slot === 2 ? 'ds-p2' : 'ds-p1'} ds-c-{l.color}">
      <Avatar seat={l.slot} color={l.color} name={l.name} />
      <div class="ds-wlane__who">
        <b>{l.you ? t('common.nameYou', { name: l.name }) : l.name}</b>
        <span>{progress(l)}</span>
      </div>
      <WeekStrip compact days={l.days} seat={l.slot} color={l.color} />
    </div>
  {/each}

  {#if partnerMissing}
    <div class="ds-wlane ds-wlane--empty ds-p2">
      <span class="ds-wlane__ghost" aria-hidden="true"><Icon name="plus" size={16} /></span>
      <div class="ds-wlane__who"><b>{t('week.teamPlaceholder')}</b><span>{t('week.partnerWaiting')}</span></div>
    </div>
  {/if}

  {#if checkedPartner}
    <button type="button" class="ds-weekcard__row" onclick={onview}>
      <span class="ds-weekcard__grow">{t('week.partnerChecked', { name: checkedPartner })}</span>
      <strong>{t('week.view')}</strong>
      <Icon name="chevron-right" size={20} />
    </button>
  {:else if nudgeName}
    <Button variant="secondary" icon="hand" fullWidth loading={nudging} onclick={onnudge}>{t('home.nudge', { name: nudgeName })}</Button>
  {/if}
  {#if nudgeMessage}<Banner tone={nudgeMessage.tone}>{nudgeMessage.text}</Banner>{/if}

  <hr class="ds-weekcard__rule" />
  <a class="ds-weekcard__row" href={bet === null && betUpcoming === null ? '/bet#einsatz' : '/bet'}>
    <Icon name="target" size={20} />
    <span class="ds-weekcard__grow">
      {#if bet !== null}<span class="muted">{t('week.betLine')}</span> {bet}
      {:else if betUpcoming}<span class="muted">{t('week.betLine')}</span> {t('week.betFrom', { date: weekdayDate(betUpcoming.effectiveFrom), text: betUpcoming.text })}
      {:else}{t('week.betMissing')}{/if}
    </span>
    <Icon name="chevron-right" size={20} />
  </a>
</section>
