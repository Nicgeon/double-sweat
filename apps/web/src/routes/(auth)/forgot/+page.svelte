<script lang="ts">
  import { t, tSplit } from '#lib/i18n/index.svelte.ts';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';

  const [noMailBefore, noMailAfter] = $derived(tSplit('forgot.noMail', 'command'));
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
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('forgot.docTitle')} · Double Sweat</title></svelte:head>

<h1 class="auth__title">{t('forgot.title')}</h1>
{#if session.health && !session.health.features.mail}
  <Banner tone="info" title={t('forgot.noMailTitle')}>
    {noMailBefore}<code>cli reset-password</code>{noMailAfter}
  </Banner>
{:else if sent}
  <Banner tone="success" title={t('forgot.sentTitle')}>
    {t('forgot.sentBody')}
  </Banner>
{:else}
  <p class="auth__lead">{t('forgot.lead')}</p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label={t('common.email')} type="email" bind:value={email} autocomplete="email" required />
    <Button type="submit" size="lg" loading={busy}>{t('forgot.submit')}</Button>
  </form>
{/if}
<Button variant="ghost" href="/login">{t('common.toLogin')}</Button>
