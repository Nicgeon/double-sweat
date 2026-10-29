<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { pendingJoin } from '#lib/native/boot.svelte.ts';
  import { probeServer, ServerError } from '#lib/native/server-url.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';

  let error = $state<string | null>(null);
  let busy = $state(false);
  const link = $derived(pendingJoin.link);
  const host = $derived(link ? new URL(link.server).host : '');

  function close() {
    pendingJoin.link = null;
    error = null;
  }

  async function connect() {
    if (!link) return;
    busy = true;
    error = null;
    try {
      const info = await probeServer(link.server);
      if (session.serverUrl) await session.forgetServer();
      await session.useServer(link.server, info);
      const code = link.code;
      close();
      await goto(`/join/${code}`);
    } catch (e) {
      error = e instanceof ServerError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<Sheet open={link !== null} title={t('joinLink.title')} onclose={close}>
  <div class="stack">
    <p class="code">{host}</p>
    <p>{t('joinLink.body')}</p>
    {#if session.serverUrl}
      <Banner tone="warning" title={t('joinLink.switchTitle')}>{t('joinLink.switchBody', { host: new URL(session.serverUrl).host })}</Banner>
    {/if}
    {#if error}<Banner tone="error">{error}</Banner>{/if}
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={close}>{t('common.cancel')}</Button>
    <Button loading={busy} onclick={connect}>{t('joinLink.connect')}</Button>
  {/snippet}
</Sheet>
