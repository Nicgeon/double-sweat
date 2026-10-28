<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';

  // Das Token verschwindet nach dem Laden aus der Adresszeile (Verlauf, Screenshots)
  const token = page.params.token ?? '';
  onMount(() => replaceState('/reset', {}));

  let password = $state('');
  let done = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      unwrap(await api.POST('/api/v1/auth/reset-password', { body: { token, newPassword: password } }));
      done = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Neues Passwort · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

<h1 class="auth__title">Neues Passwort.</h1>
{#if done}
  <Banner tone="success" title="Passwort geändert">Alle Geräte wurden abgemeldet. Melde dich mit dem neuen Passwort an.</Banner>
  <Button size="lg" href="/login">Zur Anmeldung</Button>
{:else}
  {#if error}<Banner tone="error" title="Das hat nicht geklappt">{error} Fordere gegebenenfalls einen neuen Link an.</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label="Neues Passwort" type="password" bind:value={password} hint="Mindestens 10 Zeichen." minlength={10} maxlength={128} autocomplete="new-password" required />
    <Button type="submit" size="lg" loading={busy}>Passwort speichern</Button>
  </form>
{/if}
