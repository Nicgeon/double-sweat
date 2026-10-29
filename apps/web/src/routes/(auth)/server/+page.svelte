<script lang="ts">
  import { goto } from '$app/navigation';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { normalizeServerUrl, probeServer, ServerError } from '#lib/native/server-url.ts';
  import { session } from '#lib/state/session.svelte.ts';

  let address = $state(session.serverUrl ?? '');
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Die Web-App kennt ihren Server (same-origin); die Seite gibt es nur in der Android-App
  $effect(() => {
    if (!NATIVE) void goto('/', { replaceState: true });
  });

  async function connect(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      const origin = normalizeServerUrl(address);
      const info = await probeServer(origin);
      if (origin !== session.serverUrl && session.serverUrl) await session.forgetServer();
      await session.useServer(origin, info);
      await session.init();
      await goto('/login', { replaceState: true });
    } catch (err) {
      error = err instanceof ServerError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Server · Double Sweat</title></svelte:head>

<h1 class="auth__title">Mit deinem Server verbinden.</h1>
<p class="auth__lead">Double Sweat läuft auf einem Server, den du oder dein Partner betreibt. Gib seine Adresse ein.</p>
{#if error}<Banner tone="error">{error}</Banner>{/if}
<form class="form" onsubmit={connect}>
  <Field label="Serveradresse" bind:value={address} type="text" inputmode="url" placeholder="sweat.beispiel.de" autocapitalize="none" autocomplete="url" spellcheck={false} hint="Nur HTTPS. Vor jeder Anmeldung prüft die App, ob dort ein Double-Sweat-Server antwortet." required />
  <Button type="submit" size="lg" loading={busy}>Verbinden</Button>
</form>
