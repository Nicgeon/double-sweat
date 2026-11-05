<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import Page from '#lib/components/Page.svelte';
  import { dateAndTime } from '#lib/util/format.ts';
  import { describeAgent } from '#lib/util/push.ts';

  type Sess = { id: string; kind: string; label: string | null; createdAt: number; lastSeenAt: number; current: boolean };

  let sessions = $state<Sess[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : t('common.failed'));

  async function load() {
    try {
      sessions = unwrap(await api.GET('/api/v1/auth/sessions')).sessions;
    } catch (e) {
      fail(e);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function endSession(id: string) {
    try {
      unwrap(await api.DELETE('/api/v1/auth/sessions/{id}', { params: { path: { id } } }));
      await load();
    } catch (e) {
      fail(e);
    }
  }
</script>

<Page title={t('more.sessionsCard')} backHref="/profile">
  {#if error}<Banner tone="error">{error}</Banner>{/if}

  <div class="stack narrow">
    <Card>
      {#if loading}
        <div class="stack stack--tight" role="status" aria-busy="true">
          <span class="ds-sr">{t('common.loading')}</span>
          <div class="ds-skel" style="height: 44px"></div>
          <div class="ds-skel" style="height: 44px"></div>
        </div>
      {:else}
        <ul class="list">
          {#each sessions as s (s.id)}
            <li class="line">
              <span>{s.kind === 'web' ? describeAgent(s.label ?? '') : (s.label ?? t('more.appSession'))}{s.current ? ` ${t('more.thisDevice')}` : ''}<span class="small muted"> · {t('more.lastSeen', { date: dateAndTime(s.lastSeenAt) })}</span></span>
              {#if !s.current}<Button variant="ghost" size="sm" onclick={() => endSession(s.id)}>{t('common.signOut')}</Button>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>
</Page>
