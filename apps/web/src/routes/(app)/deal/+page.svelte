<script lang="ts">
  import { page } from '$app/state';
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import DealCard from '#lib/components/DealCard.svelte';
  import DealRule from '#lib/components/DealRule.svelte';
  import DebtRow from '#lib/components/DebtRow.svelte';
  import Field from '#lib/components/Field.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import InviteSheet from '#lib/components/InviteSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import RewardRow from '#lib/components/RewardRow.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import Stepper from '#lib/components/Stepper.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';
  import { addDays, isoWeek, longDate, weekdayDate, weekNumber } from '#lib/util/format.ts';

  type Goals = { currentWeekStart: string; currentGoal: number | null; nextWeekStart: string; nextGoal: number | null; newGoalStartsNow: boolean };
  type Debt = { id: string; weekStart: string; betText: string; redeemedAt: number | null; direction: 'owe' | 'owed'; debtorName: string; creditorName: string };
  type BetEntry = { text: string; effectiveFrom: string };
  type PersonBet = { current: string | null; currentFrom: string | null; upcoming: BetEntry[] };
  type BetOverview = { currentWeekStart: string; mine: PersonBet; partner: (PersonBet & { displayName: string }) | null; required: boolean };
  type Pledge = { current: string | null; upcoming: { text: string | null; effectiveFrom: string } | null };
  type Rewards = { mine: Pledge; partner: (Pledge & { displayName: string }) | null };
  type Claim = { id: string; weekStart: string; rewardText: string; redeemedAt: number | null; direction: 'earned' | 'give'; recipientName: string; giverName: string };
  /** Ein Eintrag der Liste "Offen": Einsatz (Schuld) oder Belohnung, die eingelöst werden will. */
  type Item = { kind: 'bet'; weekStart: string; debt: Debt } | { kind: 'reward'; weekStart: string; claim: Claim };

  let goals = $state<Goals | null>(null);
  let nextGoal = $state(3);
  let bet = $state<BetOverview | null>(null);
  let rewards = $state<Rewards | null>(null);
  let debts = $state<Debt[]>([]);
  let claims = $state<Claim[]>([]);
  /** Auch Erledigtes laden und unter "Erledigt" zeigen */
  let showDone = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let sheet = $state<'' | 'goal' | 'bet' | 'reward'>('');
  let savingGoal = $state(false);
  let betText = $state('');
  let betFrom = $state('');
  let savingBet = $state(false);
  let rewardText = $state('');
  let savingReward = $state(false);
  let redeeming = $state<string | null>(null);
  let inviteOpen = $state(false);

  const me = $derived(session.me);
  const partner = $derived(todayStore.partner);
  const partnerName = $derived(bet?.partner?.displayName ?? rewards?.partner?.displayName);
  /** Du hast weder einen gültigen noch einen vorgemerkten Einsatz. */
  const betMissing = $derived(bet !== null && bet.mine.current === null && bet.mine.upcoming.length === 0);
  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : t('common.failed'));

  /** Wochen, ab denen ein Einsatz gelten kann: diese, die nächste und bis zu 12 Wochen voraus. */
  const weekOptions = $derived.by(() => {
    if (!bet) return [];
    return Array.from({ length: 13 }, (_, i) => {
      const value = addDays(bet?.currentWeekStart ?? '', i * 7);
      const n = isoWeek(value);
      const label = i === 0 ? t('bet.weekThis', { n }) : i === 1 ? t('bet.weekNext', { n }) : t('bet.weekLater', { n, date: weekdayDate(value) });
      return { value, label };
    });
  });

  // ---- Offen: Schulden und verdiente Belohnungen in einer Liste, neueste Woche zuerst ----
  const items = $derived.by<Item[]>(() => {
    const all: Item[] = [
      ...debts.map((debt): Item => ({ kind: 'bet', weekStart: debt.weekStart, debt })),
      ...claims.map((claim): Item => ({ kind: 'reward', weekStart: claim.weekStart, claim })),
    ];
    return all.sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : a.kind === b.kind ? 0 : a.kind === 'bet' ? -1 : 1));
  });
  const isDone = (item: Item) => (item.kind === 'bet' ? item.debt.redeemedAt !== null : item.claim.redeemedAt !== null);
  const openItems = $derived(items.filter((i) => !isDone(i)));
  const doneItems = $derived(items.filter(isDone));

  async function loadLists() {
    const status = showDone ? 'all' : 'open';
    try {
      const [d, c] = await Promise.all([
        api.GET('/api/v1/debts', { params: { query: { status } } }),
        api.GET('/api/v1/reward-claims', { params: { query: { status } } }),
      ]);
      debts = unwrap(d).debts;
      claims = unwrap(c).claims;
    } catch (e) {
      fail(e);
    }
  }

  /** Stand von Heute (Abzeichen an der Leiste, Hinweis) nach jeder Änderung erneuern. */
  const refreshToday = () => void todayStore.load().catch(() => {});

  onMount(async () => {
    refreshToday();
    try {
      goals = unwrap(await api.GET('/api/v1/goals')) as Goals;
      nextGoal = goals.nextGoal ?? goals.currentGoal ?? 3;
      bet = unwrap(await api.GET('/api/v1/bets')) as BetOverview;
      rewards = unwrap(await api.GET('/api/v1/rewards')) as Rewards;
    } catch (e) {
      fail(e);
    }
    await loadLists();
    // Links aus der Starthilfe und von Heute öffnen gleich das passende Fenster
    const target = page.url.hash;
    if (target === '#ziel') openGoal();
    else if (target === '#einsatz') openBet();
    else if (target === '#belohnung' && rewards?.partner) openReward();
  });

  async function toggleDone() {
    showDone = !showDone;
    await loadLists();
  }

  async function redeem(item: Item) {
    const id = item.kind === 'bet' ? item.debt.id : item.claim.id;
    redeeming = id;
    error = null;
    try {
      if (item.kind === 'bet') unwrap(await api.POST('/api/v1/debts/{id}/redeem', { params: { path: { id } } }));
      else unwrap(await api.POST('/api/v1/reward-claims/{id}/redeem', { params: { path: { id } } }));
      await loadLists();
      refreshToday();
    } catch (e) {
      fail(e);
    } finally {
      redeeming = null;
    }
  }

  // ---- Ziel ----
  function openGoal() {
    if (!goals) return;
    nextGoal = goals.nextGoal ?? goals.currentGoal ?? 3;
    sheet = 'goal';
  }
  async function saveGoal() {
    savingGoal = true;
    error = null;
    notice = null;
    try {
      const startsNow = goals?.newGoalStartsNow ?? false;
      goals = unwrap(await api.PUT('/api/v1/goals/next', { body: { days: nextGoal } })) as Goals;
      sheet = '';
      notice = startsNow ? tn('goal.savedNow', nextGoal) : tn('goal.savedFrom', nextGoal, { date: longDate(goals.nextWeekStart) });
      refreshToday();
    } catch (e) {
      fail(e);
    } finally {
      savingGoal = false;
    }
  }

  // ---- Einsatz ----
  /** Fenster zum Festlegen öffnen: Standard ist die laufende Woche, für später mit `from`. */
  function openBet(from?: string, text?: string) {
    if (!bet) return;
    betFrom = from ?? bet.currentWeekStart;
    betText = text ?? bet.mine.upcoming.find((u) => u.effectiveFrom === betFrom)?.text ?? bet.mine.current ?? '';
    sheet = 'bet';
  }
  async function saveBet() {
    savingBet = true;
    error = null;
    notice = null;
    try {
      bet = unwrap(await api.PUT('/api/v1/bets', { body: { text: betText, from: betFrom } })) as BetOverview;
      sheet = '';
      notice = partnerName ? t('bet.saved', { name: partnerName }) : t('bet.savedAlone');
      refreshToday();
    } catch (e) {
      fail(e);
    } finally {
      savingBet = false;
    }
  }
  async function removeUpcoming(from: string) {
    error = null;
    try {
      bet = unwrap(await api.DELETE('/api/v1/bets/{from}', { params: { path: { from } } })) as BetOverview;
      refreshToday();
    } catch (e) {
      fail(e);
    }
  }

  // ---- Belohnung (was du der anderen Person versprichst) ----
  function openReward() {
    rewardText = rewards?.mine.upcoming ? (rewards.mine.upcoming.text ?? '') : (rewards?.mine.current ?? '');
    sheet = 'reward';
  }
  async function saveReward() {
    savingReward = true;
    error = null;
    try {
      rewards = unwrap(await api.PUT('/api/v1/rewards', { body: { text: rewardText } })) as Rewards;
      sheet = '';
    } catch (e) {
      fail(e);
    } finally {
      savingReward = false;
    }
  }

  /** Chips mit dem Wochenziel einer Person: das laufende und, wenn es abweicht, das ab nächster Woche. */
  function goalChips(current: number | null, next: number | null, nextWeekStart: string): { text: string; risk?: boolean }[] {
    if (current === null && next === null) return [{ text: t('deal.goalNone'), risk: true }];
    const chips: { text: string; risk?: boolean }[] = [];
    if (current !== null) chips.push({ text: tn('deal.goalDays', current) });
    if (next !== null && next !== current) chips.push({ text: tn('deal.goalFrom', next, { date: weekdayDate(nextWeekStart) }) });
    return chips;
  }
  const myChips = $derived(goals ? goalChips(goals.currentGoal, goals.nextGoal, goals.nextWeekStart) : []);
  const partnerChips = $derived(partner ? goalChips(partner.goalDays, partner.nextGoalDays, addDays(partner.weekStart, 7)) : []);
</script>

<Page title={t('nav.deal')} subtitle={bet ? t('deal.subtitle', { n: isoWeek(bet.currentWeekStart) }) : undefined}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}
  <div class="cols cols--deal">
    <!-- Offen: was gerade eingelöst werden will, in beide Richtungen -->
    <section class="stack stack--tight" aria-labelledby="open-title">
      <div class="line">
        <h2 class="ds-card__title" id="open-title">{t('deal.open')}</h2>
        {#if openItems.length > 0}<span class="ds-chip ds-chip--plain" aria-label={String(openItems.length)}>{openItems.length}</span>{/if}
      </div>
      {#if openItems.length === 0}
        <div class="ds-empty-row">
          <span class="ds-empty-row__icon"><Icon name="circle-check" size={20} /></span>
          <div>
            <strong>{t('debt.nothingOpen')}</strong>
            <p class="small muted">{t('deal.nothingOpenHint')}</p>
          </div>
        </div>
      {:else}
        <ul class="list">
          {#each openItems as item (item.kind + (item.kind === 'bet' ? item.debt.id : item.claim.id))}
            {#if item.kind === 'bet'}
              <DebtRow
                debtorName={item.debt.debtorName}
                creditorName={item.debt.creditorName}
                viewerIsCreditor={item.debt.direction === 'owed'}
                bet={item.debt.betText}
                week={weekNumber(item.debt.weekStart)}
                busy={redeeming === item.debt.id}
                onredeem={() => redeem(item)}
              />
            {:else}
              <RewardRow
                recipientName={item.claim.recipientName}
                giverName={item.claim.giverName}
                viewerIsRecipient={item.claim.direction === 'earned'}
                reward={item.claim.rewardText}
                week={weekNumber(item.claim.weekStart)}
                busy={redeeming === item.claim.id}
                onreceive={() => redeem(item)}
              />
            {/if}
          {/each}
        </ul>
      {/if}

      <Button variant="ghost" size="sm" icon={showDone ? undefined : 'chevron-down'} onclick={toggleDone}>{showDone ? t('deal.hideDone') : t('deal.showDone')}</Button>
      {#if showDone}
        <section class="stack stack--tight" aria-labelledby="done-title">
          <h2 class="ds-card__title" id="done-title">{t('deal.done')}</h2>
          {#if doneItems.length === 0}
            <p class="muted">{t('debt.none')}</p>
          {:else}
            <ul class="list">
              {#each doneItems as item (item.kind + (item.kind === 'bet' ? item.debt.id : item.claim.id))}
                {#if item.kind === 'bet'}
                  <DebtRow
                    debtorName={item.debt.debtorName}
                    creditorName={item.debt.creditorName}
                    viewerIsCreditor={item.debt.direction === 'owed'}
                    bet={item.debt.betText}
                    week={weekNumber(item.debt.weekStart)}
                    redeemed
                  />
                {:else}
                  <RewardRow
                    recipientName={item.claim.recipientName}
                    giverName={item.claim.giverName}
                    viewerIsRecipient={item.claim.direction === 'earned'}
                    reward={item.claim.rewardText}
                    week={weekNumber(item.claim.weekStart)}
                    received
                  />
                {/if}
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </section>

    <!-- Eure Abmachung: je Person Ziel und die beiden Wenn-dann-Regeln -->
    <section class="stack stack--tight" aria-labelledby="deal-title">
      <h2 class="ds-card__title" id="deal-title">{t('deal.title')}</h2>

      <DealCard id="deal-me" you name={me?.displayName ?? ''} seat={me?.slot === 2 ? 2 : 1} color={me?.color}>
        {#snippet action()}
          {#if goals && goals.currentGoal === null && goals.nextGoal === null}
            <Button size="sm" onclick={openGoal}>{t('deal.goalSet')}</Button>
          {:else}
            <Button variant="ghost" size="sm" onclick={openGoal}>{t('deal.goalChange')}</Button>
          {/if}
        {/snippet}
        <div class="ds-person__chips">
          {#each myChips as c (c.text)}
            <span class="ds-chip {c.risk ? 'ds-chip--risk' : 'ds-chip--plain'}">{#if c.risk}<Icon name="timer" size={16} />{/if}{c.text}</span>
          {/each}
        </div>

        {#if bet?.partner}
          <DealRule tone="done" label={t('deal.makeYou')}>
            {#if rewards?.partner?.current}{t('deal.givesYou', { name: bet.partner.displayName, text: rewards.partner.current })}{:else}{t('reward.nothingPromised')}{/if}
            {#snippet sub()}
              {#if rewards?.partner?.upcoming}{t('bet.from', { date: longDate(rewards.partner.upcoming.effectiveFrom), text: rewards.partner.upcoming.text ?? t('reward.noReward') })}{/if}
            {/snippet}
          </DealRule>
        {/if}

        <DealRule tone="alert" label={t('deal.missYou')}>
          {#if bet?.mine.current}
            {t('deal.youGive', { name: partnerName ?? t('gate.anyone'), text: bet.mine.current })}
          {:else if betMissing}
            {t('deal.noStakeYou')}
          {/if}
          {#snippet sub()}
            {#if betMissing}{t('bet.noneBody')}{/if}
            {#each bet?.mine.upcoming ?? [] as u (u.effectiveFrom)}
              <span class="ds-rule__plan">
                <span>{t('bet.planLine', { n: isoWeek(u.effectiveFrom), date: weekdayDate(u.effectiveFrom) })}: {u.text}</span>
                <span class="row">
                  <Button variant="ghost" size="sm" aria-label={t('deal.changePlanned', { date: weekdayDate(u.effectiveFrom) })} onclick={() => openBet(u.effectiveFrom, u.text)}>{t('common.change')}</Button>
                  <Button variant="ghost" size="sm" icon="trash-2" iconOnly onclick={() => removeUpcoming(u.effectiveFrom)}>{t('bet.remove')}</Button>
                </span>
              </span>
            {/each}
          {/snippet}
          {#snippet action()}
            {#if betMissing}
              <Button size="sm" aria-label={t('deal.setStake')} onclick={() => openBet()}>{t('deal.set')}</Button>
            {:else}
              <Button variant="ghost" size="sm" aria-label={t('deal.changeStake')} onclick={() => openBet()}>{t('common.change')}</Button>
            {/if}
          {/snippet}
        </DealRule>
        {#if !betMissing}
          <Button variant="secondary" size="sm" icon="plus" onclick={() => openBet(addDays(bet?.currentWeekStart ?? '', 7))}>{t('bet.planButton')}</Button>
        {/if}
      </DealCard>

      {#if bet?.partner && partner}
        <DealCard id="deal-partner" name={bet.partner.displayName} seat={partner.slot === 2 ? 2 : 1} color={partner.color}>
          <div class="ds-person__chips">
            {#each partnerChips as c (c.text)}
              <span class="ds-chip {c.risk ? 'ds-chip--risk' : 'ds-chip--plain'}">{#if c.risk}<Icon name="timer" size={16} />{/if}{c.text}</span>
            {/each}
          </div>

          <DealRule tone="done" label={t('deal.makeOther', { name: bet.partner.displayName })}>
            {#if rewards?.mine.current}{t('deal.youGive', { name: bet.partner.displayName, text: rewards.mine.current })}{:else}{t('reward.nothingPromised')}{/if}
            {#snippet sub()}
              {#if rewards?.mine.upcoming}{t('bet.from', { date: longDate(rewards.mine.upcoming.effectiveFrom), text: rewards.mine.upcoming.text ?? t('reward.noReward') })}{/if}
            {/snippet}
            {#snippet action()}
              <Button variant="ghost" size="sm" aria-label={t(rewards?.mine.current ? 'deal.changeReward' : 'deal.setReward', { name: bet?.partner?.displayName ?? '' })} onclick={openReward}>{rewards?.mine.current ? t('common.change') : t('deal.set')}</Button>
            {/snippet}
          </DealRule>

          <DealRule tone="alert" label={t('deal.missOther', { name: bet.partner.displayName })}>
            {#if bet.partner.current}{t('deal.givesYou', { name: bet.partner.displayName, text: bet.partner.current })}{:else}{t('bet.partnerNone', { name: bet.partner.displayName })}{/if}
            {#snippet sub()}
              {#each bet?.partner?.upcoming ?? [] as u (u.effectiveFrom)}
                <span>{t('bet.from', { date: weekdayDate(u.effectiveFrom), text: u.text })}</span>
              {/each}
            {/snippet}
          </DealRule>
        </DealCard>
      {:else}
        <section class="ds-card ds-card--dashed" aria-labelledby="deal-missing">
          <h3 class="ds-person__name" id="deal-missing">{t('deal.partnerMissing')}</h3>
          <p class="small muted">{t('deal.partnerMissingBody')}</p>
          <div><Button variant="secondary" size="sm" icon="send" onclick={() => (inviteOpen = true)}>{t('guide.inviteButton')}</Button></div>
        </section>
      {/if}

      <p class="small muted">{t('bet.rule')} {t('reward.rule')}</p>
    </section>
  </div>
</Page>

<InviteSheet open={inviteOpen} onclose={() => (inviteOpen = false)} />

<Sheet open={sheet === 'goal'} title={t('goal.card')} onclose={() => (sheet = '')}>
  {#if goals}
    <div class="stack">
      <p class="small muted">
        {goals.currentGoal !== null ? tn('goal.thisWeek', goals.currentGoal, { week: weekNumber(goals.currentWeekStart) }) : t('goal.noneThisWeek')}
        {goals.newGoalStartsNow ? t('goal.startsNow') : t('goal.startsNextWeek')}
      </p>
      <Stepper label={me ? t('goal.stepperOf', { name: me.displayName }) : t('goal.stepperOfYou')} bind:value={nextGoal} color={me?.color} partner={me?.slot === 2 ? 2 : 1} />
      <p class="small muted">{goals.newGoalStartsNow ? t('goal.noteNow') : t('goal.noteFrom', { date: longDate(goals.nextWeekStart) })}</p>
    </div>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (sheet = '')}>{t('common.cancel')}</Button>
    <Button loading={savingGoal} onclick={saveGoal}>{t('goal.save')}</Button>
  {/snippet}
</Sheet>

<Sheet open={sheet === 'bet'} title={t('bet.sheetTitle')} onclose={() => (sheet = '')}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveBet(); }}>
    <Field label={t('bet.fieldLabel', { name: partnerName ?? t('gate.anyone') })} bind:value={betText} maxlength={140} hint={t('bet.fieldHint')} required />
    <div class="ds-field">
      <label class="ds-field__label" for="bet-from">{t('bet.fromLabel')}</label>
      <div class="ds-field__control">
        <select id="bet-from" class="ds-field__input" bind:value={betFrom}>
          {#each weekOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </div>
    </div>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (sheet = '')}>{t('common.cancel')}</Button>
    <Button loading={savingBet} onclick={saveBet}>{t('common.save')}</Button>
  {/snippet}
</Sheet>

<Sheet open={sheet === 'reward'} title={t('reward.sheetTitle')} onclose={() => (sheet = '')}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveReward(); }}>
    <Field label={t('reward.fieldLabel', { name: rewards?.partner?.displayName ?? t('common.yourPartner') })} bind:value={rewardText} maxlength={140} hint={t('reward.fieldHint')} />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (sheet = '')}>{t('common.cancel')}</Button>
    <Button loading={savingReward} onclick={saveReward}>{t('common.save')}</Button>
  {/snippet}
</Sheet>

<style>
  .ds-rule__plan {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
</style>
