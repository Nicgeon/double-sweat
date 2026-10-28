<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import { session } from '#lib/state/session.svelte.ts';

  const token = page.params.token ?? '';
  let phase = $state<'working' | 'ok' | 'failed'>('working');
  let message = $state('');

  onMount(async () => {
    replaceState('/verify', {});
    try {
      unwrap(await api.POST('/api/v1/auth/verify-email', { body: { token } }));
      phase = 'ok';
      if (session.user) await session.refresh();
    } catch (err) {
      phase = 'failed';
      message = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    }
  });
</script>

<svelte:head><title>E-Mail bestätigen · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

<h1 class="auth__title">E-Mail bestätigen.</h1>
{#if phase === 'working'}
  <p class="auth__lead" role="status">Einen Moment …</p>
{:else if phase === 'ok'}
  <Banner tone="success" title="Bestätigt">Deine E-Mail-Adresse ist jetzt bestätigt.</Banner>
{:else}
  <Banner tone="error" title="Dieser Link gilt nicht mehr">{message} Fordere in den Einstellungen einen neuen an.</Banner>
{/if}
<Button variant="secondary" href="/">Zur App</Button>
