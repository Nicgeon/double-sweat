<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Logo from '#lib/components/Logo.svelte';
  import NavBar, { type NavItem } from '#lib/components/NavBar.svelte';
  import NoTeam from '#lib/components/NoTeam.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { syncPush } from '#lib/util/push.ts';

  let { children } = $props();

  // Ohne Anmeldung zur Anmeldeseite, danach zurück zur gewünschten Seite
  $effect(() => {
    if (session.ready && !session.user) {
      const next = page.url.pathname + page.url.search;
      void goto(`/login?next=${encodeURIComponent(next)}`, { replaceState: true });
    }
  });
  $effect(() => {
    if (session.user) void session.refreshUnread();
  });
  // App: hat der UnifiedPush-Verteiler den Endpunkt gewechselt, dem Server den neuen melden
  $effect(() => {
    if (NATIVE && session.user) void syncPush().catch(() => {});
  });

  const items: NavItem[] = $derived([
    { id: 'start', label: t('nav.start'), icon: 'house', href: '/' },
    { id: 'history', label: t('nav.history'), icon: 'history', href: '/history' },
    { id: 'checkin', label: t('nav.checkin'), icon: 'camera', href: '/checkin', primary: true },
    { id: 'bet', label: t('nav.bet'), icon: 'gift', href: '/bet' },
    { id: 'more', label: t('nav.more'), icon: 'settings', href: '/more' },
  ]);
  const current = $derived.by(() => {
    const path = page.url.pathname;
    if (path === '/') return 'start';
    return items.find((i) => i.href !== '/' && path.startsWith(i.href))?.id ?? '';
  });
</script>

{#if session.user}
  {#if !session.team}
    <NoTeam />
  {:else}
    <div class="app">
      <div class="app__side">
        <NavBar variant="side" {items} {current}>
          {#snippet header()}<Logo size={28} />{/snippet}
        </NavBar>
      </div>
      <main class="app__main">{@render children()}</main>
      <div class="app__tabs"><NavBar {items} {current} /></div>
    </div>
  {/if}
{/if}
