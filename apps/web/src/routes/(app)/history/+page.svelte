<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type History, unwrap } from '#lib/api/client.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import Page from '#lib/components/Page.svelte';
  import StatusChip from '#lib/components/StatusChip.svelte';
  import Streak from '#lib/components/Streak.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { isoWeek, shortDate } from '#lib/util/format.ts';

  let weeks = $state<History['weeks']>([]);
  let streaks = $state<History['streaks'] | null>(null);
  let cursor = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load(before?: string) {
    loading = true;
    error = null;
    try {
      const res = unwrap(await api.GET('/api/v1/history', { params: { query: { limit: 8, before } } }));
      weeks = before ? [...weeks, ...res.weeks] : res.weeks;
      streaks = res.streaks;
      cursor = res.nextCursor ?? null;
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  const partnerName = $derived(session.partner?.displayName ?? 'Partner');
</script>

<Page title="Verlauf">
  {#if error}<Banner tone="error" title="Das hat nicht geklappt">{error}</Banner>{/if}

  {#if streaks}
    <div class="row">
      <Streak weeks={streaks.team.current} />
      <span class="small muted">Beste Serie: {streaks.team.best} {streaks.team.best === 1 ? 'Woche' : 'Wochen'}</span>
    </div>
  {/if}

  {#if !loading && weeks.length === 0 && !error}
    <div class="center">
      <p class="lead">Noch keine abgeschlossene Woche.</p>
      <p class="muted">Nach dem ersten gemeinsamen Montag erscheint hier das Ergebnis.</p>
    </div>
  {/if}

  <ol class="list">
    {#each weeks as w (w.weekStart)}
      <li>
        <Card title="KW {isoWeek(w.weekStart)} · {shortDate(w.weekStart)}">
          {#snippet action()}
            {#if w.teamMet === true}<StatusChip status="done">Beide geschafft</StatusChip>
            {:else if w.teamMet === false}<StatusChip status="missed">Nicht erreicht</StatusChip>{/if}
          {/snippet}
          <ul class="list">
            {#each w.members as m (m.userId)}
              <li class="line">
                <span class="row">
                  <Avatar seat={m.slot} color={m.color} name={m.displayName} size="sm" />
                  <span>{m.isMe ? 'Du' : m.displayName}</span>
                </span>
                <span class="row">
                  <span class="small">{m.doneDays}{m.goalDays !== null ? ` von ${m.goalDays}` : ''} Tagen</span>
                  {#if m.met === true}<StatusChip status="done" />
                  {:else if m.met === false}<StatusChip status="missed" />
                  {:else}<span class="small muted">nicht gewertet</span>{/if}
                </span>
              </li>
              {#if m.debt}
                <li class="small muted">
                  {m.debt.role === 'debtor' ? (m.isMe ? 'Du schuldest den Einsatz' : `${m.displayName} schuldet den Einsatz`) : ''}
                  {m.debt.redeemed ? ' · eingelöst' : ''}
                </li>
              {/if}
            {/each}
          </ul>
        </Card>
      </li>
    {/each}
  </ol>

  {#if cursor}
    <Button variant="secondary" loading={loading} onclick={() => load(cursor ?? undefined)}>Ältere Wochen laden</Button>
  {/if}
  <p class="ds-sr">{partnerName}</p>
</Page>
