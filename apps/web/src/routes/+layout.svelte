<script lang="ts">
  import '../app.css';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import JoinLinkSheet from '#lib/components/JoinLinkSheet.svelte';
  import { startBackButton, startDeepLinks } from '#lib/native/boot.svelte.ts';
  import { CLIENT_API, NATIVE } from '#lib/native/flag.ts';
  import { serverPreset } from '#lib/native/server-preset.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import LanguageSwitch from '#lib/components/LanguageSwitch.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { theme } from '#lib/state/theme.svelte.ts';

  let { children } = $props();
  let retrying = $state(false);
  const serverLocked = serverPreset().locked;

  onMount(() => {
    theme.init();
    let stop = () => {};
    let stopBack = () => {};
    void session.init().then(async () => {
      stop = await startDeepLinks();
      stopBack = await startBackButton();
    });
    return () => {
      stop();
      stopBack();
    };
  });

  // App: ohne eingerichteten Server zuerst dorthin (außer die Seite selbst)
  $effect(() => {
    if (NATIVE && session.ready && !session.serverUrl && !page.url.pathname.startsWith('/server')) {
      void goto('/server', { replaceState: true });
    }
  });

  async function retry() {
    retrying = true;
    await session.init();
    retrying = false;
  }
</script>

<svelte:head><title>Double Sweat</title></svelte:head>

{#if !session.ready}
  <div class="boot" role="status" aria-label={t('common.loading')}><Logo variant="mark" size={48} /></div>
{:else if session.versionProblem}
  <div class="auth">
    <div class="auth__box">
      <Logo size={32} />
      <h1 class="auth__title">{t('root.versionTitle')}</h1>
      <Banner tone="warning" title={session.versionProblem === 'server_too_old' ? t('root.versionServerOldTitle') : t('root.versionAppOldTitle')}>
        {session.versionProblem === 'server_too_old' ? t('serverUrl.serverTooOld') : t('serverUrl.clientTooOld')}
        {t('root.versionHint', { app: CLIENT_API, server: session.health?.apiVersion ?? '?' })}
      </Banner>
      <Button size="lg" icon="refresh-cw" loading={retrying} onclick={retry}>{t('common.retry')}</Button>
      {#if !NATIVE}<Button variant="ghost" onclick={() => location.reload()}>{t('error.reload')}</Button>
      {:else if !serverLocked}<Button variant="ghost" href="/server">{t('root.changeServer')}</Button>{/if}
      <LanguageSwitch />
    </div>
  </div>
{:else if session.unreachable && !session.user}
  <div class="auth">
    <div class="auth__box">
      <Logo size={32} />
      <h1 class="auth__title">{t('root.unreachableTitle')}</h1>
      <Banner tone="error" title={t('root.unreachableBannerTitle')}>
        {t('root.unreachableBody')}
      </Banner>
      <Button size="lg" icon="refresh-cw" loading={retrying} onclick={retry}>{t('common.retry')}</Button>
      {#if NATIVE && !serverLocked}<Button variant="ghost" href="/server">{t('root.changeServer')}</Button>{/if}
      <LanguageSwitch />
    </div>
  </div>
{:else}
  {@render children()}
  {#if NATIVE}<JoinLinkSheet />{/if}
{/if}
