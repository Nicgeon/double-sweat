<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Logo from './Logo.svelte';

  let code = $state('');
  let setupToken = $state('');
  let teamName = $state('Unser Team');
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
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
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
    <h1 class="auth__title">Du bist noch in keinem Team.</h1>
    <p class="auth__lead">Gib den Einladungscode deines Partners ein{canCreate ? ' oder gründe ein neues Team' : ''}.</p>
    {#if error}<Banner tone="error">{error}</Banner>{/if}
    <form class="form" onsubmit={(e) => { e.preventDefault(); void join(); }}>
      <Field label="Einladungscode" bind:value={code} placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" required />
      <Button type="submit" size="lg" loading={busy}>Beitreten</Button>
    </form>
    {#if canCreate}
      <form class="form" onsubmit={(e) => { e.preventDefault(); void create(); }}>
        <Field label="Teamname" bind:value={teamName} maxlength={60} />
        {#if needsToken}<Field label="Setup-Token" type="password" bind:value={setupToken} autocomplete="off" required />{/if}
        <Button type="submit" variant="secondary" size="lg" loading={busy}>Neues Team gründen</Button>
      </form>
    {/if}
    <Button variant="ghost" onclick={async () => { await session.logout(); await goto('/login'); }}>Abmelden</Button>
  </div>
</div>
