<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ApiError } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { safeNext } from '#lib/util/next.ts';

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  const next = $derived(safeNext(page.url.searchParams.get('next')));
  const expired = $derived(page.url.searchParams.get('expired') === '1');
  const canRegister = $derived(session.health?.signup.mode === 'open' || session.health?.signup.mode === 'token');

  // Schon angemeldet: direkt weiter, kein zweites Formular
  $effect(() => {
    if (session.user) void goto(next, { replaceState: true });
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await session.login(email, password);
      await goto(next, { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Anmelden · Double Sweat</title></svelte:head>

<h1 class="auth__title">Willkommen zurück.</h1>
{#if expired}<Banner tone="info" title="Deine Sitzung ist abgelaufen">Bitte melde dich erneut an.</Banner>{/if}
{#if error}<Banner tone="error">{error}</Banner>{/if}
<form class="form" onsubmit={submit}>
  <Field label="E-Mail" type="email" bind:value={email} autocomplete="email" required />
  <Field label="Passwort" type="password" bind:value={password} autocomplete="current-password" required />
  <div class="form__actions">
    <Button type="submit" size="lg" loading={busy}>Anmelden</Button>
    {#if session.health?.features.mail}<Button variant="ghost" href="/forgot">Passwort vergessen</Button>{/if}
    {#if canRegister}<Button variant="ghost" href="/register">Neues Team gründen</Button>{/if}
  </div>
</form>
