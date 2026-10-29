<script lang="ts">
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
  import { isoWeek, longDate } from '#lib/util/format.ts';

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
  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.');

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
      const days = `${nextGoal} ${nextGoal === 1 ? 'Tag' : 'Tagen'}`;
      notice = startsNow
        ? `Gespeichert. Dein Ziel von ${days} gilt ab sofort, auch für diese Woche.`
        : `Gespeichert. Dein Ziel von ${days} gilt ab ${longDate(goals.nextWeekStart)}.`;
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
      bet = unwrap(await api.PUT('/api/v1/bets', { body: { text: betText } })) as typeof bet;
      betOpen = false;
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

<Page title="Einsatz">
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <div class="cols">
    <div class="stack">
      <Card title="Einsatz">
        {#snippet action()}<Button variant="ghost" size="sm" icon="send" onclick={openBet}>Ändern</Button>{/snippet}
        <p>{bet?.current || 'Noch kein Einsatz festgelegt.'}</p>
        {#if bet?.upcoming}
          <p class="small muted">Ab {longDate(bet.upcoming.effectiveFrom)}: {bet.upcoming.text}</p>
        {/if}
        <p class="small muted">Wer sein Wochenziel verfehlt, schuldet dem anderen den Einsatz. Eine Änderung gilt erst für Wochen, die noch bei niemandem begonnen haben.</p>
      </Card>

      <Card title="Dein Wochenziel" id="ziel">
        {#if goals}
          <div class="stack">
            <p class="small muted">
              {goals.currentGoal !== null ? `Diese Woche (KW ${isoWeek(goals.currentWeekStart)}): ${goals.currentGoal} ${goals.currentGoal === 1 ? 'Tag' : 'Tage'}.` : 'Diese Woche ist noch kein Ziel gesetzt.'}
              {goals.newGoalStartsNow ? 'Dein erstes Ziel gilt sofort.' : 'Eine Änderung gilt ab nächster Woche.'}
            </p>
            <Stepper label="Wochenziel von {me?.displayName ?? 'dir'}" bind:value={nextGoal} color={me?.color} partner={me?.slot === 2 ? 2 : 1} />
            <p class="small muted">{goals.newGoalStartsNow ? 'Gilt ab sofort, diese Woche wird noch nicht gewertet.' : `Gilt ab ${longDate(goals.nextWeekStart)}.`}</p>
            {#if notice}<Banner tone="success">{notice}</Banner>{/if}
            <Button loading={savingGoal} onclick={saveGoal}>Ziel speichern</Button>
          </div>
        {/if}
      </Card>

      <Card title="Belohnung" id="belohnung">
        {#snippet action()}<Button variant="ghost" size="sm" icon="gift" disabled={!rewards?.partner} onclick={openReward}>Ändern</Button>{/snippet}
        <div class="stack">
          {#if rewards?.partner}
            <p><strong>Du für {rewards.partner.displayName}:</strong> {rewards.mine.current || 'Noch nichts versprochen.'}</p>
            {#if rewards.mine.upcoming}
              <p class="small muted">Ab {longDate(rewards.mine.upcoming.effectiveFrom)}: {rewards.mine.upcoming.text ?? 'keine Belohnung'}</p>
            {/if}
            <p><strong>{rewards.partner.displayName} für dich:</strong> {rewards.partner.current || 'Noch nichts versprochen.'}</p>
            {#if rewards.partner.upcoming}
              <p class="small muted">Ab {longDate(rewards.partner.upcoming.effectiveFrom)}: {rewards.partner.upcoming.text ?? 'keine Belohnung'}</p>
            {/if}
            <p class="small muted">Wer sein Wochenziel schafft, bekommt, was der andere versprochen hat. Eine Änderung gilt erst für Wochen, die noch bei niemandem begonnen haben.</p>
          {:else}
            <p class="muted">Sobald dein Partner dabei ist, könnt ihr einander Belohnungen versprechen.</p>
          {/if}
        </div>
      </Card>
    </div>

    <div class="stack">
      <section class="stack" aria-labelledby="debts-title">
        <div class="line">
          <h2 class="ds-card__title" id="debts-title">Schulden</h2>
          <Segmented label="Anzeige" bind:value={filter} onchange={() => { void loadDebts(); void loadClaims(); }} options={[{ value: 'open', label: 'Offen' }, { value: 'all', label: 'Alle' }]} />
        </div>
        {#if debts.length === 0}
          <p class="muted">{filter === 'open' ? 'Nichts offen.' : 'Noch keine Schulden.'}</p>
        {:else}
          <ul class="list">
            {#each debts as d (d.id)}
              <DebtRow
                debtorName={d.debtorName}
                creditorName={d.creditorName}
                viewerIsCreditor={d.direction === 'owed'}
                bet={d.betText}
                week="KW {isoWeek(d.weekStart)}"
                redeemed={d.redeemedAt !== null}
                busy={redeeming === d.id}
                onredeem={() => redeem(d.id)}
              />
            {/each}
          </ul>
        {/if}
      </section>

      <section class="stack" aria-labelledby="claims-title">
        <h2 class="ds-card__title" id="claims-title">Verdiente Belohnungen</h2>
        {#if claims.length === 0}
          <p class="muted">{filter === 'open' ? 'Nichts offen.' : 'Noch keine Belohnungen verdient.'}</p>
        {:else}
          <ul class="list">
            {#each claims as c (c.id)}
              <RewardRow
                recipientName={c.recipientName}
                giverName={c.giverName}
                viewerIsRecipient={c.direction === 'earned'}
                reward={c.rewardText}
                week="KW {isoWeek(c.weekStart)}"
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

<Sheet open={betOpen} title="Einsatz ändern" onclose={() => (betOpen = false)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveBet(); }}>
    <Field label="Was steht auf dem Spiel?" bind:value={betText} maxlength={140} hint="Gilt ab der nächsten Woche." required />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (betOpen = false)}>Abbrechen</Button>
    <Button loading={savingBet} onclick={saveBet}>Speichern</Button>
  {/snippet}
</Sheet>

<Sheet open={rewardOpen} title="Belohnung festlegen" onclose={() => (rewardOpen = false)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void saveReward(); }}>
    <Field label="Was bekommt {rewards?.partner?.displayName ?? 'dein Partner'}, wenn das Wochenziel klappt?" bind:value={rewardText} maxlength={140} hint="Gilt ab der nächsten Woche. Leer lassen, um sie zurückzuziehen." />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (rewardOpen = false)}>Abbrechen</Button>
    <Button loading={savingReward} onclick={saveReward}>Speichern</Button>
  {/snippet}
</Sheet>
