<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import JoinLinkSheet from '#lib/components/JoinLinkSheet.svelte';
  import { startDeepLinks } from '#lib/native/boot.svelte.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { theme } from '#lib/state/theme.svelte.ts';

  let { children } = $props();
  let retrying = $state(false);

  onMount(() => {
    theme.init();
    let stop = () => {};
    void session.init().then(async () => {
      stop = await startDeepLinks();
    });
    return () => stop();
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
  <div class="boot" role="status" aria-label="Lädt"><Logo variant="mark" size={48} /></div>
{:else if session.unreachable && !session.user}
  <div class="auth">
    <div class="auth__box">
      <Logo size={32} />
      <h1 class="auth__title">Kein Kontakt zum Server.</h1>
      <Banner tone="error" title="Der Server ist gerade nicht erreichbar">
        Prüfe deine Verbindung und versuch es gleich noch einmal.
      </Banner>
      <Button size="lg" icon="refresh-cw" loading={retrying} onclick={retry}>Erneut versuchen</Button>
      {#if NATIVE}<Button variant="ghost" href="/server">Server ändern</Button>{/if}
    </div>
  </div>
{:else}
  {@render children()}
  {#if NATIVE}<JoinLinkSheet />{/if}
{/if}
