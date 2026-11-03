<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { page } from '$app/state';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Logo from '#lib/components/Logo.svelte';

  const notFound = $derived(page.status === 404);
  const detail = $derived(page.error?.detail);
</script>

<svelte:head><title>{t('error.title')} · Double Sweat</title></svelte:head>

<div class="auth">
  <div class="auth__box">
    <Logo size={32} />
    <h1 class="auth__title">{notFound ? t('error.notFound') : t('error.title')}</h1>
    {#if !notFound}
      <Banner tone="error" title={t('error.bannerTitle', { code: page.status })}>{t('error.body')}</Banner>
    {/if}
    <Button size="lg" icon="refresh-cw" onclick={() => location.reload()}>{t('error.reload')}</Button>
    <Button variant="ghost" href="/">{t('error.home')}</Button>
    {#if detail && !notFound}
      <details class="small muted">
        <summary>{t('error.detail')}</summary>
        <p class="error-detail">{detail}</p>
      </details>
    {/if}
  </div>
</div>
