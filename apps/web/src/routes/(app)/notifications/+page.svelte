<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import Page from '#lib/components/Page.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { relative } from '#lib/util/format.ts';

  type Item = { id: string; type: string; title: string; body: string; createdAt: number; read: boolean };
  let items = $state<Item[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = unwrap(await api.GET('/api/v1/notifications', { params: { query: { limit: 50 } } }));
      items = res.notifications;
      session.unread = res.unreadCount;
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      loading = false;
    }
  });

  async function markAll() {
    try {
      unwrap(await api.POST('/api/v1/notifications/read', { body: {} }));
      items = items.map((i) => ({ ...i, read: true }));
      session.unread = 0;
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    }
  }
</script>

<Page title="Benachrichtigungen" backHref="/">
  {#snippet actions()}
    {#if session.unread > 0}<Button variant="ghost" size="sm" icon="check" onclick={markAll}>Alle gelesen</Button>{/if}
  {/snippet}
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if !loading && items.length === 0 && !error}
    <div class="center"><p class="lead">Keine Benachrichtigungen.</p></div>
  {/if}
  <ul class="list">
    {#each items as n (n.id)}
      <li>
        <Card tone={n.read ? 'sunken' : undefined}>
          <p><strong>{n.title}</strong></p>
          <p>{n.body}</p>
          <p class="small muted">{relative(n.createdAt)}{n.read ? '' : ' · neu'}</p>
        </Card>
      </li>
    {/each}
  </ul>
</Page>
