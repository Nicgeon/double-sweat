<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import BetGate from '#lib/components/BetGate.svelte';
  import CheckinFab from '#lib/components/CheckinFab.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import NavBar, { type NavItem } from '#lib/components/NavBar.svelte';
  import NoTeam from '#lib/components/NoTeam.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';
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
  // Stand von heute für die Check-in-Schaltfläche und das Abzeichen der Abmachung
  $effect(() => {
    if (session.user && session.team) void todayStore.load().catch(() => {});
    else todayStore.clear();
  });
  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && session.user && session.team) {
        void todayStore.load().catch(() => {});
        void session.refreshUnread();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
  // App: hat der UnifiedPush-Verteiler den Endpunkt gewechselt, dem Server den neuen melden
  $effect(() => {
    if (NATIVE && session.user) void syncPush().catch(() => {});
  });

  const tabs: NavItem[] = $derived([
    { id: 'today', label: t('nav.today'), icon: 'house', href: '/' },
    { id: 'history', label: t('nav.history'), icon: 'history', href: '/history' },
    { id: 'deal', label: t('nav.deal'), icon: 'target', href: '/bet', badge: todayStore.openCount || undefined },
    { id: 'profile', label: t('nav.profile'), icon: 'user', href: '/more' },
  ]);
  // Seitenleiste (Desktop): Check-in oben als große Schaltfläche, das Postfach unten
  const sideItems: NavItem[] = $derived([
    { id: 'checkin', label: t('nav.checkin'), icon: 'camera', href: '/checkin', primary: true },
    ...tabs,
  ]);
  const sideSecondary: NavItem[] = $derived([
    { id: 'notifications', label: t('nav.notifications'), icon: 'bell', href: '/notifications', badge: session.unread || undefined },
  ]);
  const current = $derived.by(() => {
    const path = page.url.pathname;
    if (path === '/' || path.startsWith('/notifications')) return 'today';
    if (path.startsWith('/history')) return 'history';
    if (path.startsWith('/bet')) return 'deal';
    if (path.startsWith('/more')) return 'profile';
    return '';
  });
  /** Die Check-in-Schaltfläche schwebt nur auf den drei Hauptseiten, nicht im Profil und nicht in Unterseiten. */
  const showFab = $derived(['/', '/history', '/bet'].includes(page.url.pathname) && todayStore.canCheckin);
</script>

{#if session.user}
  {#if !session.team}
    <NoTeam />
  {:else if !todayStore.settled}
    <!-- Erst wenn der Stand da ist, steht fest, ob die Person zuerst ihren Einsatz festlegen muss -->
    <div class="ds-sr" role="status">{t('common.loading')}</div>
  {:else if todayStore.dashboard?.betRequired}
    <BetGate partnerName={todayStore.partner?.displayName} partnerBet={todayStore.dashboard.partnerBet} />
  {:else}
    <div class="app">
      <div class="app__side">
        <NavBar variant="side" items={sideItems} secondary={sideSecondary} {current}>
          {#snippet header()}<Logo size={28} />{/snippet}
        </NavBar>
      </div>
      <main class="app__main">{@render children()}</main>
      {#if showFab}<CheckinFab more={todayStore.checkedInToday} />{/if}
      <div class="app__tabs"><NavBar items={tabs} {current} /></div>
    </div>
  {/if}
{/if}
