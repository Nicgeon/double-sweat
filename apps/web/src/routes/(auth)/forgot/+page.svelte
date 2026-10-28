<script lang="ts">
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';

  let email = $state('');
  let sent = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      unwrap(await api.POST('/api/v1/auth/forgot-password', { body: { email } }));
      sent = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Passwort vergessen · Double Sweat</title></svelte:head>

<h1 class="auth__title">Passwort vergessen.</h1>
{#if session.health && !session.health.features.mail}
  <Banner tone="info" title="Auf diesem Server ist kein Mailversand eingerichtet">
    Bitte den Administrator um einen Reset-Link (Befehl <code>cli reset-password</code>).
  </Banner>
{:else if sent}
  <Banner tone="success" title="Wenn es das Konto gibt, ist die Mail unterwegs">
    Der Link gilt 30 Minuten und funktioniert einmal. Schau auch im Spam-Ordner nach.
  </Banner>
{:else}
  <p class="auth__lead">Wir schicken dir einen Link zum Zurücksetzen.</p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label="E-Mail" type="email" bind:value={email} autocomplete="email" required />
    <Button type="submit" size="lg" loading={busy}>Link senden</Button>
  </form>
{/if}
<Button variant="ghost" href="/login">Zur Anmeldung</Button>
