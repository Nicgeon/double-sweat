<script lang="ts">
  import { t, tSplit } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, type PartnerColor, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Field from '#lib/components/Field.svelte';
  import { joinLinkFor } from '#lib/native/deeplink.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import { PARTNER_COLOR_VALUES } from '#lib/state/colors.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { browserTimezone } from '#lib/util/next.ts';

  const code = page.params.code ?? '';
  type Preview = { inviterName: string; inviterColor: PartnerColor | null; teamName: string };
  let preview = $state<Preview | null>(null);
  let status = $state<'loading' | 'ok' | 'invalid'>('loading');

  let displayName = $state('');
  let email = $state('');
  let password = $state('');
  let color = $state<PartnerColor>('tide');
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Nur auf Android-Geräten anbieten (dort gibt es die App)
  const inApp = $derived(!NATIVE && typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent));
  const taken = $derived(preview?.inviterColor ? { [preview.inviterColor]: preview.inviterName } : {});

  onMount(async () => {
    try {
      preview = unwrap(await api.GET('/api/v1/invites/{code}', { params: { path: { code } } }));
      status = 'ok';
      // Standardfarbe des zweiten Platzes, sonst die erste freie
      if (preview.inviterColor === color) color = PARTNER_COLOR_VALUES.find((c) => c !== preview?.inviterColor) ?? 'ember';
    } catch {
      status = 'invalid';
    }
  });

  async function register(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await session.register({
        email,
        password,
        displayName,
        timezone: browserTimezone(),
        inviteCode: code,
        color,
      });
      await goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }

  async function joinExisting() {
    error = null;
    busy = true;
    try {
      unwrap(await api.POST('/api/v1/teams/join', { body: { code } }));
      await session.refresh();
      await goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('join.docTitle')} · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

{#if status === 'loading'}
  <p class="auth__lead" role="status">{t('common.wait')}</p>
{:else if status === 'invalid' || !preview}
  <h1 class="auth__title">{t('join.invalidTitle')}</h1>
  <Banner tone="info" title={t('join.invalidBannerTitle')}>
    {t('join.invalidBody')}
  </Banner>
  <Button variant="secondary" href={session.user ? '/' : '/login'}>{session.user ? t('common.toApp') : t('common.toLogin')}</Button>
{:else}
  <h1 class="auth__title">{t('join.title', { name: preview.inviterName })}</h1>
  <p class="auth__lead">
    {t('join.lead')}
  </p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if inApp}
    <Button variant="secondary" icon="smartphone" href={joinLinkFor(location.origin, code)}>{t('join.openApp')}</Button>
  {/if}

  {#if session.user && session.team}
    <Banner tone="info" title={t('join.alreadyTeamTitle')}>{t('join.alreadyTeamBody')}</Banner>
    <Button href="/">{t('common.toApp')}</Button>
  {:else if session.user}
    {@const [signedBefore, signedAfter] = tSplit('join.signedIn', 'name')}
    <p class="lead">{signedBefore}<strong>{session.user.displayName}</strong>{signedAfter}</p>
    <div class="form__actions">
      <Button size="lg" loading={busy} onclick={joinExisting}>{t('common.join')}</Button>
    </div>
  {:else}
    <form class="form" onsubmit={register}>
      <Field label={t('common.displayName')} bind:value={displayName} maxlength={40} autocomplete="nickname" required />
      <Field label={t('common.email')} type="email" bind:value={email} autocomplete="email" required />
      <Field label={t('common.password')} type="password" bind:value={password} hint={t('common.passwordHint')} minlength={10} maxlength={128} autocomplete="new-password" required />
      <div>
        <p class="ds-field__label">{t('common.yourColor')}</p>
        <ColorPicker bind:value={color} seat={2} {taken} />
      </div>
      <div class="form__actions">
        <Button type="submit" size="lg" loading={busy}>{t('common.join')}</Button>
        <Button variant="ghost" href="/login?next={encodeURIComponent(`/join/${code}`)}">{t('register.haveAccount')}</Button>
      </div>
    </form>
  {/if}
{/if}
