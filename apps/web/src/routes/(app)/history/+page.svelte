<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
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
  import { shortDate, weekNumber } from '#lib/util/format.ts';

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
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  const partnerName = $derived(session.partner?.displayName ?? t('common.partner'));
</script>

<Page title={t('history.title')}>
  {#if error}<Banner tone="error" title={t('common.failedTitle')}>{error}</Banner>{/if}

  {#if streaks}
    <div class="row">
      <Streak weeks={streaks.team.current} />
      <span class="small muted">{tn('history.best', streaks.team.best)}</span>
    </div>
  {/if}

  {#if loading && weeks.length === 0 && !error}
    <div class="stack" role="status" aria-busy="true">
      <span class="ds-sr">{t('common.loading')}</span>
      <div class="ds-skel" style="height: 140px"></div>
      <div class="ds-skel" style="height: 140px"></div>
    </div>
  {/if}

  {#if !loading && weeks.length === 0 && !error}
    <div class="center">
      <p class="lead">{t('history.empty')}</p>
      <p class="muted">{t('history.emptyHint')}</p>
    </div>
  {/if}

  <ol class="list">
    {#each weeks as w (w.weekStart)}
      <li>
        <Card title="{weekNumber(w.weekStart)} · {shortDate(w.weekStart)}">
          {#snippet action()}
            {#if w.teamMet === true}<StatusChip status="done">{t('history.bothDone')}</StatusChip>
            {:else if w.teamMet === false}<StatusChip status="missed">{t('history.notMet')}</StatusChip>{/if}
          {/snippet}
          <ul class="list">
            {#each w.members as m (m.userId)}
              <li class="line">
                <span class="row">
                  <Avatar seat={m.slot} color={m.color} name={m.displayName} size="sm" />
                  <span>{m.isMe ? t('common.you') : m.displayName}</span>
                </span>
                <span class="row">
                  <span class="small">{m.goalDays !== null ? tn('history.daysWithGoal', m.goalDays, { done: m.doneDays }) : tn('history.daysNoGoal', m.doneDays)}</span>
                  {#if m.met === true}<StatusChip status="done" />
                  {:else if m.met === false}<StatusChip status="missed" />
                  {:else}<span class="small muted">{t('history.notScored')}</span>{/if}
                </span>
              </li>
              {#if m.debt}
                <li class="small muted">
                  {m.debt.role === 'debtor' ? (m.isMe ? t('history.youOwe') : t('history.theyOwe', { name: m.displayName })) : ''}
                  {m.debt.redeemed ? ` · ${t('history.redeemed')}` : ''}
                </li>
              {/if}
            {/each}
          </ul>
        </Card>
      </li>
    {/each}
  </ol>

  {#if cursor}
    <Button variant="secondary" loading={loading} onclick={() => load(cursor ?? undefined)}>{t('history.older')}</Button>
  {/if}
  <p class="ds-sr">{partnerName}</p>
</Page>
