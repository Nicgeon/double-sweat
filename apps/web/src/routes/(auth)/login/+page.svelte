<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ApiError } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import { serverPreset } from '#lib/native/server-preset.ts';
  import { safeNext } from '#lib/util/next.ts';

  const serverLocked = serverPreset().locked;
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
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('login.docTitle')} · Double Sweat</title></svelte:head>

<h1 class="auth__title">{t('login.title')}</h1>
{#if NATIVE && session.serverUrl}
  <p class="small muted">{t('login.server', { host: new URL(session.serverUrl).host })}{#if !serverLocked} · <a href="/server">{t('login.serverChange')}</a>{/if}</p>
{/if}
{#if expired}<Banner tone="info" title={t('login.expiredTitle')}>{t('login.expiredBody')}</Banner>{/if}
{#if error}<Banner tone="error">{error}</Banner>{/if}
<form class="form" onsubmit={submit}>
  <Field label={t('common.email')} type="email" bind:value={email} autocomplete="email" required />
  <Field label={t('common.password')} type="password" bind:value={password} autocomplete="current-password" required />
  <div class="form__actions">
    <Button type="submit" size="lg" loading={busy}>{t('login.submit')}</Button>
    {#if session.health?.features.mail}<Button variant="ghost" href="/forgot">{t('login.forgot')}</Button>{/if}
    {#if canRegister}<Button variant="ghost" href="/register">{t('login.newTeam')}</Button>{/if}
  </div>
</form>
