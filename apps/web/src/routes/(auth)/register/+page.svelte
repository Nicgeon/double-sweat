<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { ApiError, type PartnerColor } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { browserTimezone } from '#lib/util/next.ts';

  let displayName = $state('');
  let email = $state('');
  let password = $state('');
  let teamName = $state(t('common.defaultTeamName'));
  let setupToken = $state('');
  let color = $state<PartnerColor>('ember');
  let error = $state<string | null>(null);
  let busy = $state(false);

  const mode = $derived(session.health?.signup.mode ?? 'token');
  const open = $derived(mode === 'open' || mode === 'token');
  const needsToken = $derived(session.health?.signup.requiresSetupToken ?? false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await session.register({
        email,
        password,
        displayName,
        timezone: browserTimezone(),
        teamName,
        color,
        setupToken: needsToken ? setupToken : undefined,
      });
      await goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('register.docTitle')} · Double Sweat</title></svelte:head>

{#if !open}
  <h1 class="auth__title">{t('register.closedTitle')}</h1>
  <Banner tone="info" title={t('register.closedBannerTitle')}>
    {t('register.closedBody')}
  </Banner>
  <Button variant="secondary" href="/login">{t('common.toLogin')}</Button>
{:else}
  <h1 class="auth__title">{t('register.title')}</h1>
  <p class="auth__lead">{t('register.lead')}</p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label={t('common.displayName')} bind:value={displayName} maxlength={40} autocomplete="nickname" required />
    <Field label={t('common.email')} type="email" bind:value={email} autocomplete="email" required />
    <Field label={t('common.password')} type="password" bind:value={password} hint={t('common.passwordHint')} minlength={10} maxlength={128} autocomplete="new-password" required />
    <Field label={t('common.teamName')} bind:value={teamName} maxlength={60} />
    {#if needsToken}<Field label={t('common.setupToken')} type="password" bind:value={setupToken} hint={t('register.setupHint')} autocomplete="off" required />{/if}
    <div>
      <p class="ds-field__label">{t('common.yourColor')}</p>
      <ColorPicker bind:value={color} seat={1} />
    </div>
    <div class="form__actions">
      <Button type="submit" size="lg" loading={busy}>{t('register.submit')}</Button>
      <Button variant="ghost" href="/login">{t('register.haveAccount')}</Button>
    </div>
  </form>
{/if}
