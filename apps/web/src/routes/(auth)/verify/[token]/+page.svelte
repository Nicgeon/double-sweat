<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import { session } from '#lib/state/session.svelte.ts';

  const token = page.params.token ?? '';
  let phase = $state<'working' | 'ok' | 'failed'>('working');
  let message = $state('');

  onMount(async () => {
    replaceState('/verify', {});
    try {
      unwrap(await api.POST('/api/v1/auth/verify-email', { body: { token } }));
      phase = 'ok';
      if (session.user) await session.refresh();
    } catch (err) {
      phase = 'failed';
      message = err instanceof ApiError ? err.message : t('common.failed');
    }
  });
</script>

<svelte:head><title>{t('verify.docTitle')} · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

<h1 class="auth__title">{t('verify.title')}</h1>
{#if phase === 'working'}
  <p class="auth__lead" role="status">{t('common.wait')}</p>
{:else if phase === 'ok'}
  <Banner tone="success" title={t('verify.okTitle')}>{t('verify.okBody')}</Banner>
{:else}
  <Banner tone="error" title={t('verify.failedTitle')}>{message} {t('verify.failedHint')}</Banner>
{/if}
<Button variant="secondary" href="/">{t('common.toApp')}</Button>
