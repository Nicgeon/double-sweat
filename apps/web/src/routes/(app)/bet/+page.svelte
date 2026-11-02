<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import DebtRow from '#lib/components/DebtRow.svelte';
  import Field from '#lib/components/Field.svelte';
  import Page from '#lib/components/Page.svelte';
  import RewardRow from '#lib/components/RewardRow.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import Stepper from '#lib/components/Stepper.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';
  import { longDate, weekNumber } from '#lib/util/format.ts';

  type Goals = { currentWeekStart: string; currentGoal: number | null; nextWeekStart: string; nextGoal: number | null; newGoalStartsNow: boolean };
  type Debt = { id: string; weekStart: string; betText: string; redeemedAt: number | null; direction: 'owe' | 'owed'; debtorName: string; creditorName: string };
  let goals = $state<Goals | null>(null);
  let nextGoal = $state(3);
  let bet = $state<{ current: string | null; upcoming: { text: string; effectiveFrom: string } | null } | null>(null);
  type Pledge = { current: string | null; upcoming: { text: string | null; effectiveFrom: string } | null };
  type Rewards = { mine: Pledge; partner: (Pledge & { displayName: string }) | null };
  type Claim = { id: string; weekStart: string; rewardText: string; redeemedAt: number | null; direction: 'earned' | 'give'; recipientName: string; giverName: string };
  let debts = $state<Debt[]>([]);
  let rewards = $state<Rewards | null>(null);
  let claims = $state<Claim[]>([]);
  let rewardOpen = $state(false);
  let rewardText = $state('');
  let savingReward = $state(false);
  let receiving = $state<string | null>(null);
  let filter = $state<'open' | 'all'>('open');
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let savingGoal = $state(false);
  let betOpen = $state(false);
  let betText = $state('');
  let savingBet = $state(false);
  let redeeming = $state<string | null>(null);

  const me = $derived(session.me);
  /** Es gibt weder einen gültigen noch einen vorgemerkten Einsatz. Er ist Pflicht: ohne ihn zählt keine Woche. */
  const betMissing = $derived(bet !== null && bet.current === null && bet.upcoming === null);
  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : t('common.failed'));

  async function loadDebts() {
    try {
      debts = unwrap(await api.GET('/api/v1/debts', { params: { query: { status: filter } } })).debts;
    } catch (e) {
      fail(e);
    }
  }

  onMount(async () => {
    try {
      goals = unwrap(await api.GET('/api/v1/goals')) as Goals;
      nextGoal = goals.nextGoal ?? goals.currentGoal ?? 3;
      bet = unwrap(await api.GET('/api/v1/bets')) as typeof bet;
      rewards = unwrap(await api.GET('/api/v1/rewards')) as Rewards;
    } catch (e) {
      fail(e);
    }
    await Promise.all([loadDebts(), loadClaims()]);
  });

  async function saveGoal() {
    savingGoal = true;
    error = null;
    notice = null;
    try {
      const startsNow = goals?.newGoalStartsNow ?? false;
      goals = unwrap(await api.PUT('/api/v1/goals/next', { body: { days: nextGoal } })) as Goals;
      notice = startsNow
        ? tn('goal.savedNow', nextGoal)
        : tn('goal.savedFrom', nextGoal, { date: longDate(goals.nextWeekStart) });
    } catch (e) {
      fail(e);
    } finally {
      savingGoal = false;
    }
  }

  async function loadClaims() {
    try {
      claims = unwrap(await api.GET('/api/v1/reward-claims', { params: { query: { status: filter } } })).claims;
    } catch (e) {
      fail(e);
    }
  }

  function openReward() {
    rewardText = rewards?.mine.upcoming ? (rewards.mine.upcoming.text ?? '') : (rewards?.mine.current ?? '');
    rewardOpen = true;
  }
  async function saveReward() {
    savingReward = true;
    error = null;
    try {
      rewards = unwrap(await api.PUT('/api/v1/rewards', { body: { text: rewardText } })) as Rewards;
      rewardOpen = false;
    } catch (e) {
      fail(e);
    } finally {
      savingReward = false;
    }
  }
  async function receive(id: string) {
    receiving = id;
    try {
      unwrap(await api.POST('/api/v1/reward-claims/{id}/redeem', { params: { path: { id } } }));
      await loadClaims();
    } catch (e) {
      fail(e);
    } finally {
      receiving = null;
    }
  }

  function openBet() {
    betText = bet?.upcoming?.text ?? bet?.current ?? '';
    betOpen = true;
  }
  async function saveBet() {
    savingBet = true;
    error = null;
    try {
      const first = betMissing;
      bet = unwrap(await api.PUT('/api/v1/bets', { body: { text: betText } })) as typeof bet;
      betOpen = false;
      if (first) notice = t('bet.savedFirst');
      // Heute, Abzeichen und Starthilfe sollen den neuen Stand sehen
      void todayStore.load().catch(() => {});
    } catch (e) {
      fail(e);
    } finally {
      savingBet = false;
    }
  }

  async function redeem(id: string) {
    redeeming = id;
    try {
      unwrap(await api.POST('/api/v1/debts/{id}/redeem', { params: { path: { id } } }));
      await loadDebts();
    } catch (e) {
      fail(e);
    } finally {
      redeeming = null;
    }
  }
</script>

<Page title={t('nav.deal')}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <div class="cols">
    <div class="stack">
      <Card title={t('bet.title')} id="einsatz">
        {#snippet action()}
          {#if betMissing}<Button size="sm" icon="send" onclick={openBet}>{t('bet.set')}</Button>
          {:else}<Button variant="ghost" size="sm" icon="send" onclick={openBet}>{t('common.change')}</Button>{/if}
        {/snippet}
        {#if betMissing}
          <Banner tone="warning" title={t('bet.requiredTitle')}>{t('bet.requiredBody')}</Banner>
        {:else if bet?.current}
          <p>{bet.current}</p>
        {/if}
        {#if bet?.upcoming}
          <p class="small muted">{t('bet.from', { date: longDate(bet.upcoming.effectiveFrom), text: bet.upcoming.text })}</p>
        {/if}
        <p class="small muted">{t('bet.rule')}</p>
      </Card>

      <Card title={t('goal.card')} id="ziel">
        {#if goals}
          <div class="stack">
            <p class="small muted">
              {goals.currentGoal !== null ? tn('goal.thisWeek', goals.currentGoal, { week: weekNumber(goals.currentWeekStart) }) : t('goal.noneThisWeek')}
              {goals.newGoalStartsNow ? t('goal.startsNow') : t('goal.startsNextWeek')}
            </p>
            <Stepper label={me ? t('goal.stepperOf', { name: me.displayName }) : t('goal.stepperOfYou')} bind:value={nextGoal} color={me?.color} partner={me?.slot === 2 ? 2 : 1} />
            <p class="small muted">{goals.newGoalStartsNow ? t('goal.noteNow') : t('goal.noteFrom', { date: longDate(goals.nextWeekStart) })}</p>
            {#if notice}<Banner tone="success">{notice}</Banner>{/if}
            <Button loading={savingGoal} onclick={saveGoal}>{t('goal.save')}</Button>
          </div>
        {/if}
      </Card>

      <Card title={t('reward.card')} id="belohnung">
        {#snippet action()}<Button variant="ghost" size="sm" icon="gift" disabled={!rewards?.partner} onclick={openReward}>{t('common.change')}</Button>{/snippet}
        <div class="stack">
          {#if rewards?.partner}
            <p><strong>{t('reward.youFor', { name: rewards.partner.displayName })}</strong> {rewards.mine.current || t('reward.nothingPromised')}</p>
            {#if rewards.mine.upcoming}
              <p class="small muted">{t('bet.from', { date: longDate(rewards.mine.upcoming.effectiveFrom), text: rewards.mine.upcoming.text ?? t('reward.noReward') })}</p>
            {/if}
            <p><strong>{t('reward.forYou', { name: rewards.partner.displayName })}</strong> {rewards.partner.current || t('reward.nothingPromised')}</p>
            {#if rewards.partner.upcoming}
              <p class="small muted">{t('bet.from', { date: longDate(rewards.partner.upcoming.effectiveFrom), text: rewards.partner.upcoming.text ?? t('reward.noReward') })}</p>
            {/if}
            <p class="small muted">{t('reward.rule')}</p>
          {:else}
            <p class="muted">{t('reward.waitPartner')}</p>
          {/if}
        </div>
      </Card>
    </div>

    <div class="stack">
      <section class="stack" aria-labelledby="debts-title">
        <div class="line">
          <h2 class="ds-card__title" id="debts-title">{t('debt.card')}</h2>
          <Segmented label={t('debt.filter')} bind:value={filter} onchange={() => { void loadDebts(); void loadClaims(); }} options={[{ value: 'open', label: t('debt.filterOpen') }, { value: 'all', label: t('debt.filterAll') }]} />
        </div>
        {#if debts.length === 0}
          <p class="muted">{filter === 'open' ? t('debt.nothingOpen') : t('debt.none')}</p>
        {:else}
          <ul class="list">
            {#each debts as d (d.id)}
              <DebtRow
                debtorName={d.debtorName}
                creditorName={d.creditorName}
                viewerIsCreditor={d.direction === 'owed'}
                bet={d.betText}
                week={weekNumber(d.weekStart)}
                redeemed={d.redeemedAt !== null}
                busy={redeeming === d.id}
                onredeem={() => redeem(d.id)}
              />
            {/each}
          </ul>
        {/if}
      </section>

      <section class="stack" aria-labelledby="claims-title">
        <h2 class="ds-card__title" id="claims-title">{t('claims.card')}</h2>
        {#if claims.length === 0}
          <p class="muted">{filter === 'open' ? t('debt.nothingOpen') : t('claims.none')}</p>
        {:else}
          <ul class="list">
            {#each claims as c (c.id)}
              <RewardRow
                recipientName={c.recipientName}
                giverName={c.giverName}
                viewerIsRecipient={c.direction === 'earned'}
                reward={c.rewardText}
                week={weekNumber(c.weekStart)}
                received={c.redeemedAt !== null}
                busy={receiving === c.id}
                onreceive={() => receive(c.id)}
              />
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
</Page>

<Sheet open={betOpen} title={t('bet.sheetTitle')} onclose={() => (betOpen = false)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveBet(); }}>
    <Field label={t('bet.fieldLabel')} bind:value={betText} maxlength={140} hint={betMissing ? t('bet.fieldHintFirst') : t('bet.fieldHint')} required />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (betOpen = false)}>{t('common.cancel')}</Button>
    <Button loading={savingBet} onclick={saveBet}>{t('common.save')}</Button>
  {/snippet}
</Sheet>

<Sheet open={rewardOpen} title={t('reward.sheetTitle')} onclose={() => (rewardOpen = false)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveReward(); }}>
    <Field label={t('reward.fieldLabel', { name: rewards?.partner?.displayName ?? t('common.yourPartner') })} bind:value={rewardText} maxlength={140} hint={t('reward.fieldHint')} />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (rewardOpen = false)}>{t('common.cancel')}</Button>
    <Button loading={savingReward} onclick={saveReward}>{t('common.save')}</Button>
  {/snippet}
</Sheet>
