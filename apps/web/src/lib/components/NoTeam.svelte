<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Logo from './Logo.svelte';

  let code = $state('');
  let setupToken = $state('');
  let teamName = $state(t('common.defaultTeamName'));
  let error = $state<string | null>(null);
  let busy = $state(false);
  const needsToken = $derived(session.health?.signup.requiresSetupToken ?? false);
  const canCreate = $derived(session.health?.signup.mode === 'open' || session.health?.signup.mode === 'token');

  async function run(action: () => Promise<unknown>) {
    error = null;
    busy = true;
    try {
      await action();
      await session.refresh();
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
  const join = () => run(async () => unwrap(await api.POST('/api/v1/teams/join', { body: { code: code.trim() } })));
  const create = () =>
    run(async () => unwrap(await api.POST('/api/v1/teams', { body: { name: teamName, setupToken: needsToken ? setupToken : undefined } })));
</script>

<div class="auth">
  <div class="auth__box">
    <Logo size={32} />
    <h1 class="auth__title">{t('noTeam.title')}</h1>
    <p class="auth__lead">{canCreate ? t('noTeam.leadCreate') : t('noTeam.lead')}</p>
    {#if error}<Banner tone="error">{error}</Banner>{/if}
    <form class="form" onsubmit={(e) => { e.preventDefault(); void join(); }}>
      <Field label={t('noTeam.code')} bind:value={code} placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" required />
      <Button type="submit" size="lg" loading={busy}>{t('common.join')}</Button>
    </form>
    {#if canCreate}
      <form class="form" onsubmit={(e) => { e.preventDefault(); void create(); }}>
        <Field label={t('common.teamName')} bind:value={teamName} maxlength={60} />
        {#if needsToken}<Field label={t('common.setupToken')} type="password" bind:value={setupToken} autocomplete="off" required />{/if}
        <Button type="submit" variant="secondary" size="lg" loading={busy}>{t('noTeam.create')}</Button>
      </form>
    {/if}
    <Button variant="ghost" onclick={async () => { await session.logout(); await goto('/login'); }}>{t('common.signOut')}</Button>
  </div>
</div>
