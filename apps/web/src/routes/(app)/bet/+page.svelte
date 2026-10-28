<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import DebtRow from '#lib/components/DebtRow.svelte';
  import Field from '#lib/components/Field.svelte';
  import Page from '#lib/components/Page.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import Stepper from '#lib/components/Stepper.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { isoWeek, longDate } from '#lib/util/format.ts';

  type Goals = { currentWeekStart: string; currentGoal: number | null; nextWeekStart: string; nextGoal: number | null };
  type Debt = { id: string; weekStart: string; betText: string; redeemedAt: number | null; direction: 'owe' | 'owed'; debtorName: string; creditorName: string };
  let goals = $state<Goals | null>(null);
  let nextGoal = $state(3);
  let bet = $state<{ current: string | null; upcoming: { text: string; effectiveFrom: string } | null } | null>(null);
  let debts = $state<Debt[]>([]);
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
    } catch (e) {
      fail(e);
    }
    await loadDebts();
  });

  async function saveGoal() {
    savingGoal = true;
    error = null;
    notice = null;
    try {
      goals = unwrap(await api.PUT('/api/v1/goals/next', { body: { days: nextGoal } })) as Goals;
      notice = `Gespeichert. Dein Ziel von ${nextGoal} ${nextGoal === 1 ? 'Tag' : 'Tagen'} gilt ab ${longDate(goals.nextWeekStart)}.`;
    } catch (e) {
      fail(e);
    } finally {
      savingGoal = false;
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
              {goals.currentGoal !== null ? `Diese Woche (KW ${isoWeek(goals.currentWeekStart)}): ${goals.currentGoal} ${goals.currentGoal === 1 ? 'Tag' : 'Tage'}.` : 'Diese Woche ist noch kein Ziel gesetzt.'} Eine Änderung gilt ab nächster Woche.
            </p>
            <Stepper label="Wochenziel von {me?.displayName ?? 'dir'}" bind:value={nextGoal} color={me?.color} partner={me?.slot === 2 ? 2 : 1} />
            <p class="small muted">Gilt ab {longDate(goals.nextWeekStart)}.</p>
            {#if notice}<Banner tone="success">{notice}</Banner>{/if}
            <Button loading={savingGoal} onclick={saveGoal}>Ziel speichern</Button>
          </div>
        {/if}
      </Card>
    </div>

    <div class="stack">
      <section class="stack" aria-labelledby="debts-title">
        <div class="line">
          <h2 class="ds-card__title" id="debts-title">Schulden</h2>
          <Segmented label="Anzeige" bind:value={filter} onchange={loadDebts} options={[{ value: 'open', label: 'Offen' }, { value: 'all', label: 'Alle' }]} />
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
