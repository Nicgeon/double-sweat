<script lang="ts">
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
  import { weekdayDate, weekLabel } from '#lib/util/format.ts';
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
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
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
      nudgeMessage = { tone: 'success', text: `${partner.displayName} wurde angestupst.` };
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const min = Math.max(1, Math.ceil((e.retryAfterSec ?? 3600) / 60));
        nudgeMessage = { tone: 'info', text: `Du kannst ${partner.displayName} in ${min} Min. wieder anstupsen.` };
      } else {
        nudgeMessage = { tone: 'info', text: e instanceof ApiError ? e.message : 'Das hat nicht geklappt.' };
      }
    } finally {
      nudging = false;
    }
  }
</script>

<Page title="Diese Woche">
  {#snippet actions()}
    <Button variant="ghost" iconOnly icon={session.unread > 0 ? 'bell-ring' : 'bell'} href="/notifications">Benachrichtigungen{session.unread > 0 ? `, ${session.unread} neu` : ''}</Button>
  {/snippet}

  {#if error && !data}
    <Banner tone="error" title="Das hat nicht geklappt">
      {error}
      {#snippet action()}<Button variant="secondary" size="sm" onclick={load}>Erneut versuchen</Button>{/snippet}
    </Banner>
  {:else if !data}
    <p class="muted" role="status">Lädt …</p>
  {:else}
    {#if !data.team.full}
      <Banner tone="info" title="Dein Partner fehlt noch">
        Lade ihn mit einem Link ein. Gewertet wird ab dem ersten Montag, wenn ihr zu zweit seid.
        {#snippet action()}<Button variant="secondary" size="sm" icon="send" onclick={() => (inviteOpen = true)}>Einladen</Button>{/snippet}
      </Banner>
    {/if}
    {#if me && me.goalDays === null}
      <Banner tone="warning" title="Setze dein Wochenziel">
        Wie viele Tage pro Woche willst du trainieren?
        {#snippet action()}<Button variant="secondary" size="sm" href="/bet#ziel">Ziel setzen</Button>{/snippet}
      </Banner>
    {/if}
    {#if me && me.goalDays !== null && !me.checkedInToday && me.remainingDays > 0}
      <Banner tone={me.status === 'at_risk' ? 'warning' : 'info'} title={me.status === 'at_risk' ? 'Heute zählt' : 'Heute noch nicht eingecheckt'}>
        {#if me.neededDays > 0}Noch {me.neededDays} {me.neededDays === 1 ? 'Check-in' : 'Check-ins'} bis zum Wochenziel.{/if}
        {#snippet action()}<Button size="sm" icon="camera" href="/checkin">Einchecken</Button>{/snippet}
      </Banner>
    {/if}

    <div class="cols">
      <div class="stack">
        <Scoreboard weekLabel={me ? weekLabel(me.weekStart) : ''} streak={streakStore.team} {lanes}>
          {#if canNudge && partner}
            <Button variant="secondary" icon="hand" fullWidth loading={nudging} onclick={nudge}>{partner.displayName} anstupsen</Button>
          {/if}
          {#if nudgeMessage}<Banner tone={nudgeMessage.tone}>{nudgeMessage.text}</Banner>{/if}
        </Scoreboard>
      </div>

      <div class="stack">
        <Card title="Einsatz">
          {#snippet action()}<Button variant="ghost" size="sm" href="/bet">Ändern</Button>{/snippet}
          <p>{data.bet ?? 'Noch kein Einsatz festgelegt.'}</p>
          {#if data.debts.owe > 0 || data.debts.owed > 0}
            <p class="small muted">
              {#if data.debts.owe > 0}Du schuldest {data.debts.owe}.{/if}
              {#if data.debts.owed > 0}Dir werden {data.debts.owed} geschuldet.{/if}
            </p>
          {/if}
        </Card>

        <section aria-labelledby="feed-title" class="stack">
          <h2 class="ds-card__title" id="feed-title">Fotos dieser Woche</h2>
          {#if data.feed.length === 0}
            <p class="muted">Noch kein Foto diese Woche.</p>
          {:else}
            <div class="grid-photos">
              {#each data.feed as c (c.id)}
                {@const m = memberById.get(c.userId)}
                {@const t = tagMeta(c.tag)}
                <PhotoTile
                  src={c.photo.thumbUrl}
                  alt="Foto von {c.displayName}"
                  seat={m?.slot ?? 1}
                  color={m?.color}
                  name={c.displayName}
                  dateLabel={weekdayDate(c.localDate)}
                  tag={t?.label}
                  tagIcon={t?.icon}
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
/>
