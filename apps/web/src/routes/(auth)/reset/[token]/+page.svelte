<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
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
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('reset.docTitle')} · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

<h1 class="auth__title">{t('reset.title')}</h1>
{#if done}
  <Banner tone="success" title={t('reset.doneTitle')}>{t('reset.doneBody')}</Banner>
  <Button size="lg" href="/login">{t('common.toLogin')}</Button>
{:else}
  {#if error}<Banner tone="error" title={t('common.failedTitle')}>{error} {t('reset.failedHint')}</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label={t('common.newPassword')} type="password" bind:value={password} hint={t('common.passwordHint')} minlength={10} maxlength={128} autocomplete="new-password" required />
    <Button type="submit" size="lg" loading={busy}>{t('reset.submit')}</Button>
  </form>
{/if}
