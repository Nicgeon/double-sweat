<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, type Checkin, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import HealthSuggestion from '#lib/components/HealthSuggestion.svelte';
  import HintCard from '#lib/components/HintCard.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import InviteSheet from '#lib/components/InviteSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import PhotoSheet from '#lib/components/PhotoSheet.svelte';
  import PhotoTile from '#lib/components/PhotoTile.svelte';
  import StartGuide from '#lib/components/StartGuide.svelte';
  import TodayCard from '#lib/components/TodayCard.svelte';
  import WeekCard from '#lib/components/WeekCard.svelte';
  import { healthStore } from '#lib/state/health.svelte.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { streakStore } from '#lib/state/streak.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';
  import { addDays, weekdayDate, weekLabel, weekNumber } from '#lib/util/format.ts';
  import { pickHint, startGuide } from '#lib/util/hint.ts';
  import { reactionMeta } from '#lib/util/reactions.ts';
  import { tagMeta } from '#lib/util/tags.ts';
  import { laneOf } from '#lib/util/week.ts';
  import { pushWidget } from '#lib/util/widget.ts';

  let error = $state<string | null>(null);
  let nudgeMessage = $state<{ tone: 'success' | 'info'; text: string } | null>(null);
  let nudging = $state(false);
  let inviteOpen = $state(false);
  let viewing = $state<Checkin | null>(null);

  const data = $derived(todayStore.dashboard);

  async function load() {
    try {
      await todayStore.load();
      error = null;
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    }
  }
  onMount(() => {
    void load();
    void streakStore.load();
    // App mit Health Connect: Trainings jetzt und bei jeder Rückkehr in die App neu lesen (Vorschlag für den Check-in)
    return healthStore.watch();
  });

  // Links aus dem Postfach (/?photo=ID) öffnen das Foto gleich. Danach verschwindet der Zusatz aus der Adresse, damit
  // Neuladen und "Zurück" es nicht wieder öffnen. Ein Foto, das nicht (mehr) im Feed steht, wird still übergangen.
  $effect(() => {
    const id = page.url.searchParams.get('photo');
    const feed = data?.feed;
    if (!id || !feed) return;
    const found = feed.find((c) => c.id === id);
    if (found) viewing = found;
    void goto('/', { replaceState: true });
  });

  // App: Widgets auf dem Startbildschirm mit dem aktuellen Stand versorgen (auch nach Sprachwechsel)
  $effect(() => {
    if (data) void pushWidget(data, streakStore.team);
  });

  const me = $derived(todayStore.me);
  const partner = $derived(todayStore.partner);
  const lanes = $derived(data ? [...data.members].sort((a, b) => Number(b.isMe) - Number(a.isMe)).map(laneOf) : []);
  const canNudge = $derived(partner !== undefined && !partner.checkedInToday && partner.status !== 'done');
  const memberById = $derived(new Map((data?.members ?? []).map((m) => [m.userId, m])));
  const guide = $derived(data ? startGuide(data) : null);
  /** Trainings von heute aus Health Connect, für die noch kein Check-in da ist (nur solange heute noch einer geht) */
  const suggestions = $derived(todayStore.canCheckin ? healthStore.suggestions : []);
  const hint = $derived(data && !guide?.visible ? pickHint(data) : null);
  /** Heutiges Datum des Teams (Montag der Woche plus Tag-Nummer), für die Zeile unter dem Titel. */
  const today = $derived.by(() => {
    if (!me) return null;
    const i = me.days.findIndex((d) => d.isToday);
    return i < 0 ? null : addDays(me.weekStart, i);
  });
  const subtitle = $derived(me ? `${today ? `${weekdayDate(today)} · ` : ''}${weekNumber(me.weekStart)}` : undefined);
  /** Das Foto, das der andere Mensch heute gemacht hat (für "Ansehen"). */
  const partnerPhoto = $derived(
    partner && today && partner.checkedInToday ? data?.feed.find((c) => c.userId === partner.userId && c.localDate === today) : undefined,
  );

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

<Page title={t('home.title')} {subtitle}>
  {#snippet actions()}
    <Button class="bell-mobile" variant="ghost" iconOnly icon={session.unread > 0 ? 'bell-ring' : 'bell'} href="/notifications">{session.unread > 0 ? t('home.notificationsNew', { n: session.unread }) : t('home.notifications')}</Button>
  {/snippet}

  {#if error && !data}
    <Banner tone="error" title={t('common.failedTitle')}>
      {error}
      {#snippet action()}<Button variant="secondary" size="sm" onclick={load}>{t('common.retry')}</Button>{/snippet}
    </Banner>
  {:else if !data}
    <div class="stack" role="status" aria-busy="true">
      <span class="ds-sr">{t('common.loading')}</span>
      <div class="ds-skel" style="height: 80px"></div>
      <div class="ds-skel" style="height: 232px"></div>
    </div>
  {:else}
    <div class="cols cols--today">
      <div class="stack">
        {#if me}<TodayCard {me} partnerName={partner?.displayName} firstTime={!!guide && guide.visible && !guide.steps.find((s) => s.id === 'checkin')?.done} />{/if}

        {#if suggestions[0]}
          <HealthSuggestion session={suggestions[0]} more={suggestions.length - 1} ondismiss={() => suggestions[0] && healthStore.markUsed(suggestions[0].id)} />
        {/if}

        <WeekCard
          weekLabel={me ? weekLabel(me.weekStart) : ''}
          streak={streakStore.team}
          {lanes}
          partnerMissing={!data.team.full}
          checkedPartner={partnerPhoto ? partner?.displayName : undefined}
          nudgeName={!partnerPhoto && canNudge ? partner?.displayName : undefined}
          {nudging}
          {nudgeMessage}
          bet={data.bet}
          betUpcoming={data.betUpcoming}
          onview={() => (viewing = partnerPhoto ?? null)}
          onnudge={nudge}
        />

        {#if guide?.visible}
          <StartGuide steps={guide.steps} oninvite={() => (inviteOpen = true)} />
        {:else if hint?.kind === 'open'}
          <HintCard icon="gift" title={tn('hint.openTitle', hint.count)} body={partner ? t('hint.openBody', { name: partner.displayName }) : undefined}>
            {#snippet action()}<Button variant="secondary" size="sm" href="/deal">{t('week.view')}</Button>{/snippet}
          </HintCard>
        {:else if hint?.kind === 'goalNext'}
          <HintCard icon="info" title={t('home.goalNextTitle')} body={tn('home.goalNextBody', hint.days, { date: weekdayDate(addDays(hint.weekStart, 7)) })}>
            {#snippet action()}<Button variant="secondary" size="sm" href="/deal#ziel">{t('common.change')}</Button>{/snippet}
          </HintCard>
        {/if}
      </div>

      <section aria-labelledby="feed-title" class="stack">
        <h2 class="ds-card__title feed-title" id="feed-title">{t('home.feedTitle')}</h2>
        {#if data.feed.length === 0}
          <div class="ds-empty">
            <span class="ds-empty__icon"><Icon name="image" size={24} /></span>
            <strong>{t('home.feedEmpty')}</strong>
            <span class="small muted">{t('home.feedEmptyHint')}</span>
            {#if todayStore.canCheckin}<Button variant="ghost" size="sm" href="/checkin">{t('home.feedEmptyAction')}</Button>{/if}
          </div>
        {:else}
          <div class="grid-photos">
            {#each data.feed as c (c.id)}
              {@const m = memberById.get(c.userId)}
              {@const tg = tagMeta(c.tag)}
              {@const r = reactionMeta(c.reactions[0]?.kind)}
              <PhotoTile
                src={c.photo.thumbUrl}
                alt={t('photo.of', { name: c.displayName })}
                selfieSrc={c.selfie?.thumbUrl}
                selfieAlt={t('photo.selfieOf', { name: c.displayName })}
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
  onupdated={(updated) => {
    // Sportart und Notiz stehen auch auf der Kachel im Feed
    viewing = updated;
    if (todayStore.dashboard) {
      todayStore.dashboard = {
        ...todayStore.dashboard,
        feed: todayStore.dashboard.feed.map((c) => (c.id === updated.id ? updated : c)),
      };
    }
  }}
  onreacted={(id, reactions) => {
    // Auch wenn das Fenster inzwischen zu ist: Die Kachel im Feed muss den neuen Stand zeigen
    if (viewing?.id === id) viewing = { ...viewing, reactions };
    if (todayStore.dashboard) {
      todayStore.dashboard = {
        ...todayStore.dashboard,
        feed: todayStore.dashboard.feed.map((c) => (c.id === id ? { ...c, reactions } : c)),
      };
    }
  }}
/>
