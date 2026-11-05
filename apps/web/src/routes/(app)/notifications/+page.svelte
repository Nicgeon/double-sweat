<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Page from '#lib/components/Page.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { relative, weekdayDate } from '#lib/util/format.ts';
  import { groupByDay, type InboxItem, inboxLook } from '#lib/util/inbox.ts';

  const PAGE = 50;
  let items = $state<InboxItem[]>([]);
  let loading = $state(true);
  let more = $state(false);
  let error = $state<string | null>(null);

  const groups = $derived(groupByDay(items));
  const label = (kind: 'today' | 'yesterday' | 'date', key: string) =>
    kind === 'today' ? t('notifications.today') : kind === 'yesterday' ? t('notifications.yesterday') : weekdayDate(key);

  async function load(before?: number) {
    try {
      const res = unwrap(
        await api.GET('/api/v1/notifications', { params: { query: { limit: PAGE, ...(before === undefined ? {} : { before }) } } }),
      );
      items = before === undefined ? res.notifications : [...items, ...res.notifications];
      more = res.notifications.length === PAGE;
      session.unread = res.unreadCount;
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      loading = false;
    }
  }
  onMount(() => load());

  async function markAll() {
    try {
      unwrap(await api.POST('/api/v1/notifications/read', { body: {} }));
      items = items.map((i) => ({ ...i, read: true }));
      session.unread = 0;
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    }
  }

  /** Beim Antippen gilt die Mitteilung als gelesen; die Navigation zum Ziel läuft ungestört weiter. */
  function opened(item: InboxItem) {
    if (item.read) return;
    items = items.map((i) => (i.id === item.id ? { ...i, read: true } : i));
    session.unread = Math.max(0, session.unread - 1);
    void api.POST('/api/v1/notifications/read', { body: { ids: [item.id] } }).catch(() => {});
  }
</script>

<Page title={t('notifications.title')} backHref="/">
  {#snippet actions()}
    <!-- Schmal nur das Symbol (sonst verdrängt der Text den Titel), breit mit Text -->
    {#if session.unread > 0}
      <Button class="mark-icon" variant="ghost" size="sm" icon="check" iconOnly onclick={markAll}>{t('notifications.markAll')}</Button>
      <Button class="mark-text" variant="ghost" size="sm" icon="check" onclick={markAll}>{t('notifications.markAll')}</Button>
    {/if}
  {/snippet}
  {#if error}<Banner tone="error">{error}</Banner>{/if}

  {#if !loading && items.length === 0 && !error}
    <!-- Leerer Zustand: sagt, was los ist, was hierher kommt und wo man es einstellt -->
    <div class="ds-empty-row">
      <span class="ds-empty-row__icon"><Icon name="bell" size={20} /></span>
      <div>
        <strong>{t('notifications.emptyTitle')}</strong>
        <p class="small muted">{t('notifications.emptyBody')}</p>
      </div>
    </div>
  {/if}

  {#each groups as group (group.key)}
    <section class="stack stack--tight" aria-labelledby="day-{group.key}">
      <h2 class="ds-overline" id="day-{group.key}">{label(group.kind, group.key)}</h2>
      <ul class="ds-card ds-card--flush list-reset">
        {#each group.items as n (n.id)}
          {@const look = inboxLook(n.type, n.data)}
          {@const cls = `ds-msg ${n.read ? 'ds-msg--read' : 'ds-msg--new'}`}
          <li>
            {#if n.link}
              <a class={cls} href={n.link} onclick={() => opened(n)}>
                <span class="ds-tile {look.tone === 'neutral' ? '' : `ds-tile--${look.tone}`}"><Icon name={look.icon} size={20} /></span>
                <span class="ds-msg__text">
                  <span class="ds-msg__title">{n.body}</span>
                  <span class="ds-msg__cap">{relative(n.createdAt)}{n.read ? '' : ` · ${t('notifications.new')}`}</span>
                </span>
                {#if !n.read}<span class="ds-msg__dot" aria-hidden="true"></span>{/if}
                <Icon name="chevron-right" size={20} class="ds-msg__go" />
              </a>
            {:else}
              <div class={cls}>
                <span class="ds-tile {look.tone === 'neutral' ? '' : `ds-tile--${look.tone}`}"><Icon name={look.icon} size={20} /></span>
                <span class="ds-msg__text">
                  <span class="ds-msg__title">{n.body}</span>
                  <span class="ds-msg__cap">{relative(n.createdAt)}{n.read ? '' : ` · ${t('notifications.new')}`}</span>
                </span>
                {#if !n.read}<span class="ds-msg__dot" aria-hidden="true"></span>{/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if more}
    <div><Button variant="secondary" onclick={() => load(items.at(-1)?.createdAt)}>{t('notifications.older')}</Button></div>
  {/if}

  <a class="ds-card ds-msg ds-msg--link" href="/notifications/settings">
    <span class="ds-tile"><Icon name="settings" size={20} /></span>
    <span class="ds-msg__text"><span class="ds-msg__title strong">{t('notifications.settings')}</span></span>
    <Icon name="chevron-right" size={20} class="ds-msg__go" />
  </a>
</Page>

<style>
  :global(.mark-text) {
    display: none;
  }
  @media (min-width: 768px) {
    :global(.mark-icon) {
      display: none;
    }
    :global(.mark-text) {
      display: inline-flex;
    }
  }
  .list-reset {
    list-style: none;
    margin: 0;
  }
  .strong {
    font-weight: 700;
    font-size: 16px;
    line-height: 24px;
  }
</style>
