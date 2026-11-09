<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { serverPreset } from '#lib/native/server-preset.ts';
  import { normalizeServerUrl, probeServer, ServerError } from '#lib/native/server-url.ts';
  import { session } from '#lib/state/session.svelte.ts';

  // Eine App-Version kann einen Server vorschlagen (Build-Einstellung); ein gespeicherter Server geht vor
  const preset = serverPreset();
  let address = $state(session.serverUrl ?? preset.url ?? '');
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Die Web-App kennt ihren Server (same-origin), eine auf einen Server festgelegte App ebenfalls: die Seite gibt es
  // nur in der Android-App und nur, solange die Adresse nicht feststeht
  $effect(() => {
    if (!NATIVE || preset.locked) void goto('/', { replaceState: true });
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
      error = err instanceof ServerError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('server.docTitle')} · Double Sweat</title></svelte:head>

<h1 class="auth__title">{t('server.title')}</h1>
<p class="auth__lead">{t('server.lead')}</p>
{#if error}<Banner tone="error">{error}</Banner>{/if}
<form class="form" onsubmit={connect}>
  <Field label={t('server.address')} bind:value={address} type="text" inputmode="url" placeholder={t('server.placeholder')} autocapitalize="none" autocomplete="url" spellcheck={false} hint={preset.url ? t('server.hintPreset') : t('server.hint')} required />
  <Button type="submit" size="lg" loading={busy}>{t('server.connect')}</Button>
</form>
