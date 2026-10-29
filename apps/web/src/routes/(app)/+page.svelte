<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { api, ApiError, type Checkin, type Dashboard, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import InviteSheet from '#lib/components/InviteSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import PhotoSheet from '#lib/components/PhotoSheet.svelte';
  import PhotoTile from '#lib/components/PhotoTile.svelte';
  import Scoreboard from '#lib/components/Scoreboard.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { addDays, weekdayDate, weekLabel } from '#lib/util/format.ts';
  import { reactionMeta } from '#lib/util/reactions.ts';
  import { tagMeta } from '#lib/util/tags.ts';
  import { laneOf } from '#lib/util/week.ts';
  import { streakStore } from '#lib/state/streak.svelte.ts';

  let data = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);
  let nudgeMessage = $state<{ tone: 'success' | 'info'; text: string } | null>(null);
  let nudging = $state(false);
  let inviteOpen = $state(false);
  let viewing = $state<Checkin | null>(null);

  async function load() {
    try {
      data = unwrap(await api.GET('/api/v1/dashboard'));
      error = null;
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    }
  }
  onMount(() => {
    void load();
    void streakStore.load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const me = $derived(data?.members.find((m) => m.isMe));
  const partner = $derived(data?.members.find((m) => !m.isMe));
  const lanes = $derived(data ? [...data.members].sort((a, b) => Number(b.isMe) - Number(a.isMe)).map(laneOf) : []);
  const canNudge = $derived(partner !== undefined && !partner.checkedInToday && partner.status !== 'done');
  const memberById = $derived(new Map((data?.members ?? []).map((m) => [m.userId, m])));

  async function nudge() {
    if (!partner) return;
    nudging = true;
    nudgeMessage = null;
    try {
      unwrap(await api.POST('/api/v1/nudges'));
      nudgeMessage = { tone: 'success', text: t('home.nudged', { name: partner.displayName }) };
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const min = Math.max(1, Math.ceil((e.retryAfterSec ?? 3600) / 60));
        nudgeMessage = { tone: 'info', text: t('home.nudgeWait', { name: partner.displayName, n: min }) };
      } else {
        nudgeMessage = { tone: 'info', text: e instanceof ApiError ? e.message : t('common.failed') };
      }
    } finally {
      nudging = false;
    }
  }
</script>

<Page title={t('home.title')}>
  {#snippet actions()}
    <Button variant="ghost" iconOnly icon={session.unread > 0 ? 'bell-ring' : 'bell'} href="/notifications">{session.unread > 0 ? t('home.notificationsNew', { n: session.unread }) : t('home.notifications')}</Button>
  {/snippet}

  {#if error && !data}
    <Banner tone="error" title={t('common.failedTitle')}>
      {error}
      {#snippet action()}<Button variant="secondary" size="sm" onclick={load}>{t('common.retry')}</Button>{/snippet}
    </Banner>
  {:else if !data}
    <p class="muted" role="status">{t('common.loading')}</p>
  {:else}
    {#if !data.team.full}
      <Banner tone="info" title={t('home.partnerMissingTitle')}>
        {t('home.partnerMissingBody')}
        {#snippet action()}<Button variant="secondary" size="sm" icon="send" onclick={() => (inviteOpen = true)}>{t('home.invite')}</Button>{/snippet}
      </Banner>
    {/if}
    {#if me && me.goalDays === null}
      {#if me.nextGoalDays !== null}
        <Banner tone="info" title={t('home.goalNextTitle')}>
          {tn('home.goalNextBody', me.nextGoalDays, { date: weekdayDate(addDays(me.weekStart, 7)) })}
          {#snippet action()}<Button variant="secondary" size="sm" href="/bet#ziel">{t('common.change')}</Button>{/snippet}
        </Banner>
      {:else}
        <Banner tone="warning" title={t('home.goalSetTitle')}>
          {t('home.goalSetBody')}
          {#snippet action()}<Button variant="secondary" size="sm" href="/bet#ziel">{t('home.goalSet')}</Button>{/snippet}
        </Banner>
      {/if}
    {/if}
    {#if data.rewards.earned > 0}
      <Banner tone="success" title={t('home.rewardEarnedTitle')}>
        {t('home.rewardEarnedBody')} {partner ? t('home.rewardEarnedPartner', { name: partner.displayName }) : ''}
        {#snippet action()}<Button variant="secondary" size="sm" href="/bet#belohnung">{t('home.view')}</Button>{/snippet}
      </Banner>
    {/if}
    {#if me && me.goalDays !== null && !me.checkedInToday && me.remainingDays > 0}
      <Banner tone={me.status === 'at_risk' ? 'warning' : 'info'} title={me.status === 'at_risk' ? t('home.todayRiskTitle') : t('home.todayOpenTitle')}>
        {#if me.neededDays > 0}{tn('home.needed', me.neededDays)}{/if}
        {#snippet action()}<Button size="sm" icon="camera" href="/checkin">{t('home.checkin')}</Button>{/snippet}
      </Banner>
    {/if}

    <div class="cols">
      <div class="stack">
        <Scoreboard weekLabel={me ? weekLabel(me.weekStart) : ''} streak={streakStore.team} {lanes}>
          {#if canNudge && partner}
            <Button variant="secondary" icon="hand" fullWidth loading={nudging} onclick={nudge}>{t('home.nudge', { name: partner.displayName })}</Button>
          {/if}
          {#if nudgeMessage}<Banner tone={nudgeMessage.tone}>{nudgeMessage.text}</Banner>{/if}
        </Scoreboard>
      </div>

      <div class="stack">
        <Card title={t('home.betCard')}>
          {#snippet action()}<Button variant="ghost" size="sm" href="/bet">{t('common.change')}</Button>{/snippet}
          <p>{data.bet ?? t('home.betNone')}</p>
          {#if data.debts.owe > 0 || data.debts.owed > 0}
            <p class="small muted">
              {#if data.debts.owe > 0}{t('home.debtsOwe', { n: data.debts.owe })}{/if}
              {#if data.debts.owed > 0}{t('home.debtsOwed', { n: data.debts.owed })}{/if}
            </p>
          {/if}
        </Card>

        {#if partner}
          <Card title={t('home.rewardCard')}>
            {#snippet action()}<Button variant="ghost" size="sm" href="/bet#belohnung">{t('common.change')}</Button>{/snippet}
            <p>{data.reward ? t('home.rewardIf', { reward: data.reward }) : t('home.rewardNone', { name: partner.displayName })}</p>
            {#if data.rewards.earned > 0 || data.rewards.toGive > 0}
              <p class="small muted">
                {#if data.rewards.earned > 0}{tn('home.rewardsEarned', data.rewards.earned)}{/if}
                {#if data.rewards.toGive > 0}{t('home.rewardsToGive', { n: data.rewards.toGive })}{/if}
              </p>
            {/if}
          </Card>
        {/if}

        <section aria-labelledby="feed-title" class="stack">
          <h2 class="ds-card__title" id="feed-title">{t('home.feedTitle')}</h2>
          {#if data.feed.length === 0}
            <p class="muted">{t('home.feedEmpty')}</p>
          {:else}
            <div class="grid-photos">
              {#each data.feed as c (c.id)}
                {@const m = memberById.get(c.userId)}
                {@const tg = tagMeta(c.tag)}
                {@const r = reactionMeta(c.reactions[0]?.kind)}
                <PhotoTile
                  src={c.photo.thumbUrl}
                  alt={t('photo.of', { name: c.displayName })}
                  seat={m?.slot ?? 1}
                  color={m?.color}
                  name={c.displayName}
                  dateLabel={weekdayDate(c.localDate)}
                  tag={tg?.label}
                  tagIcon={tg?.icon}
                  reaction={r && c.reactions[0] ? { icon: r.icon, label: `${c.reactions[0].displayName}: ${r.label}` } : undefined}
                  onclick={() => (viewing = c)}
                />
              {/each}
            </div>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</Page>

<InviteSheet open={inviteOpen} onclose={() => (inviteOpen = false)} />
<PhotoSheet
  checkin={viewing}
  mine={viewing?.userId === session.user?.id}
  onclose={() => (viewing = null)}
  ondeleted={() => {
    viewing = null;
    void load();
  }}
  onreacted={(reactions) => {
    const open = viewing;
    if (!open) return;
    viewing = { ...open, reactions };
    if (data) data.feed = data.feed.map((c) => (c.id === open.id ? { ...c, reactions } : c));
  }}
/>
