<script lang="ts">
  import { i18n, LANGUAGE_NAMES, t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import Avatar from '#lib/components/Avatar.svelte';
  import Button from '#lib/components/Button.svelte';
  import LinkRow from '#lib/components/LinkRow.svelte';
  import Page from '#lib/components/Page.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { serverPreset } from '#lib/native/server-preset.ts';
  import { colorName } from '#lib/state/colors.ts';
  import { healthStore } from '#lib/state/health.svelte.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { theme } from '#lib/state/theme.svelte.ts';
  import { APP_VERSION, LICENSE_NAME, SOURCE_URL } from '#lib/util/source.ts';

  const user = $derived(session.user);
  const partner = $derived(session.partner);

  const themeName = $derived(
    theme.choice === 'light' ? t('more.themeLight') : theme.choice === 'dark' ? t('more.themeDark') : t('more.themeSystem'),
  );
  /** Kurze Zusammenfassung unter dem Titel: man sieht den Stand, ohne die Unterseite zu öffnen. */
  const notificationsCaption = $derived(
    user?.notifications.reminder === false ? t('profile.capReminderOff') : t('profile.capReminderOn', { time: user?.reminderTime ?? '19:00' }),
  );
  const lookCaption = $derived([user ? colorName(user.color) : '', LANGUAGE_NAMES[i18n.current], themeName].filter(Boolean).join(' · '));
  const teamCaption = $derived(partner ? t('profile.capTeamWith', { name: partner.displayName }) : t('profile.capTeamAlone'));
  const serverHost = $derived(NATIVE && session.serverUrl ? new URL(session.serverUrl).host : null);
  /** Diese App-Version ist fest auf einen Server eingestellt (Build-Einstellung): kein Wechsel */
  const serverLocked = serverPreset().locked;

  async function changeServer() {
    await session.forgetServer();
    await goto('/server');
  }
  async function logout() {
    await session.logout();
    await goto('/login');
  }
</script>

<Page title={t('nav.profile')}>
  <div class="stack narrow">
    <div class="ds-card ds-person__who">
      <Avatar size="lg" seat={session.me?.slot ?? 1} color={user?.color} name={user?.displayName ?? ''} />
      <div class="ident">
        <h2 class="ds-person__name">{user?.displayName}</h2>
        <p class="small muted ident__mail">{user?.email}</p>
      </div>
    </div>

    <div class="ds-card ds-card--flush">
      <LinkRow href="/profile/account" icon="user" title={t('more.accountCard')} caption={t('profile.capAccount')} />
      <!-- "from" lässt die Seite wissen, dass man vom Profil kommt (Zurück führt hierher, nicht ins Postfach) -->
      <LinkRow href="/notifications/settings?from=profile" icon="bell" title={t('more.pushCard')} caption={notificationsCaption} />
      {#if NATIVE}
        <LinkRow href="/profile/health" icon="heart-pulse" title={t('health.title')} caption={healthStore.enabled ? t('health.capOn') : t('health.capOff')} />
      {/if}
      <LinkRow href="/profile/appearance" icon="sun" title={t('more.appearance')} caption={lookCaption} />
      <LinkRow href="/profile/team" icon="users" title={t('more.teamCard')} caption={teamCaption} />
      <LinkRow href="/profile/devices" icon="smartphone" title={t('more.sessionsCard')} caption={t('profile.capDevices')} />
    </div>

    <div class="ds-card ds-card--flush">
      <LinkRow href="/profile/data" icon="download" title={t('profile.dataTitle')} caption={t('profile.capData')} />
    </div>

    <div class="profile-foot">
      {#if serverHost}
        <p class="small muted">{t('profile.serverLine', { host: serverHost })}{serverLocked ? ` · ${t('profile.serverLocked')}` : ''}</p>
      {/if}
      <div class="row">
        {#if serverHost && !serverLocked}<Button variant="ghost" size="sm" icon="refresh-cw" onclick={changeServer}>{t('more.switchServer')}</Button>{/if}
        <Button variant="secondary" size="sm" icon="log-out" onclick={logout}>{t('common.signOut')}</Button>
      </div>
    </div>

    <!-- AGPL-3.0 §13: Link zum Quelltext. In der App öffnet ihn das System im Browser, im Web ein neuer Tab. -->
    <p class="small muted about">
      {t('more.about', { version: APP_VERSION })} ·
      <a href={SOURCE_URL} target={NATIVE ? undefined : '_blank'} rel="noopener noreferrer">{t('more.source', { license: LICENSE_NAME })}</a>
    </p>
  </div>
</Page>

<style>
  .ident {
    min-width: 0;
  }

  .ident__mail {
    overflow-wrap: anywhere;
  }

  .profile-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-1);
  }

  .about {
    text-align: center;
  }

  /* Textlink, aber mit Trefferfläche für den Daumen */
  .about a {
    display: inline-block;
    padding: var(--space-3) var(--space-1);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
