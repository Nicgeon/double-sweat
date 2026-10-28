<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Logo from '#lib/components/Logo.svelte';
  import NavBar, { type NavItem } from '#lib/components/NavBar.svelte';
  import NoTeam from '#lib/components/NoTeam.svelte';
  import { session } from '#lib/state/session.svelte.ts';

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

  const items: NavItem[] = [
    { id: 'start', label: 'Start', icon: 'house', href: '/' },
    { id: 'history', label: 'Verlauf', icon: 'history', href: '/history' },
    { id: 'checkin', label: 'Check-in', icon: 'camera', href: '/checkin', primary: true },
    { id: 'bet', label: 'Einsatz', icon: 'gift', href: '/bet' },
    { id: 'more', label: 'Mehr', icon: 'settings', href: '/more' },
  ];
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
