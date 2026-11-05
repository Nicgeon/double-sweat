<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import Field from '#lib/components/Field.svelte';
  import PasswordSheet from '#lib/components/PasswordSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import { session } from '#lib/state/session.svelte.ts';

  const user = $derived(session.user);

  let name = $state(session.user?.displayName ?? '');
  let timezone = $state(session.user?.timezone ?? 'Europe/Berlin');
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let sheet = $state<'' | 'email' | 'password'>('');
  let newEmail = $state('');
  let currentPw = $state('');
  let newPw = $state('');

  const zones: string[] = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['Europe/Berlin', 'UTC'];
    }
  })();
  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : t('common.failed'));
  const ok = (text: string) => {
    notice = text;
    error = null;
  };

  async function saveProfile() {
    saving = true;
    error = null;
    try {
      const body: { displayName?: string; timezone?: string } = {};
      if (name.trim() !== user?.displayName) body.displayName = name.trim();
      if (timezone !== user?.timezone && timezone !== user?.pendingTimezone) body.timezone = timezone;
      if (Object.keys(body).length === 0) return ok(t('more.nothingToSave'));
      unwrap(await api.PATCH('/api/v1/me', { body }));
      await session.refresh();
      ok(body.timezone ? t('more.savedTimezone') : t('more.saved'));
    } catch (e) {
      fail(e);
    } finally {
      saving = false;
    }
  }

  async function changeEmail(password: string) {
    const res = unwrap(await api.POST('/api/v1/me/email', { body: { newEmail, password } }));
    sheet = '';
    await session.refresh();
    ok(res.status === 'verification_sent' ? t('more.emailVerificationSent') : t('more.emailChanged'));
  }
  async function changePassword() {
    error = null;
    try {
      unwrap(await api.POST('/api/v1/auth/change-password', { body: { currentPassword: currentPw, newPassword: newPw } }));
      sheet = '';
      currentPw = newPw = '';
      ok(t('more.passwordChanged'));
    } catch (e) {
      fail(e);
    }
  }
  async function resendVerification() {
    try {
      unwrap(await api.POST('/api/v1/auth/resend-verification'));
      ok(t('more.verificationResent'));
    } catch (e) {
      fail(e);
    }
  }
</script>

<Page title={t('more.accountCard')} backHref="/profile">
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="stack narrow">
    <Card title={t('more.profile')}>
      <form class="form" onsubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
        <Field label={t('common.displayName')} bind:value={name} maxlength={40} required />
        <div class="ds-field">
          <label class="ds-field__label" for="tz">{t('more.timezone')}</label>
          <div class="ds-field__control">
            <select id="tz" class="ds-field__input" bind:value={timezone}>
              {#each zones as z}<option value={z}>{z}</option>{/each}
            </select>
          </div>
          {#if user?.pendingTimezone}
            <p class="ds-field__hint">{t('more.timezonePending', { zone: user.pendingTimezone })}</p>
          {:else}
            <p class="ds-field__hint">{t('more.timezoneHint')}</p>
          {/if}
        </div>
        <Button type="submit" loading={saving}>{t('common.save')}</Button>
      </form>
    </Card>

    <Card title={t('profile.signIn')}>
      <div class="stack">
        <div class="line"><span class="muted">{t('common.email')}</span><span class="mail">{user?.email}</span></div>
        {#if session.mailEnabled && user && !user.emailVerified}
          <Banner tone="warning" title={t('more.notVerifiedTitle')}>
            {t('more.notVerifiedBody')}
            {#snippet action()}<Button variant="secondary" size="sm" onclick={resendVerification}>{t('more.resend')}</Button>{/snippet}
          </Banner>
        {/if}
        <Button variant="secondary" icon="mail" onclick={() => (sheet = 'email')}>{t('more.changeEmail')}</Button>
        <Button variant="secondary" icon="key-round" onclick={() => (sheet = 'password')}>{t('more.changePassword')}</Button>
      </div>
    </Card>
  </div>
</Page>

<PasswordSheet open={sheet === 'email'} title={t('more.emailSheet')} confirmLabel={t('common.change')} onclose={() => (sheet = '')} onconfirm={changeEmail}>
  <Field label={t('more.newEmail')} type="email" bind:value={newEmail} autocomplete="email" required />
</PasswordSheet>

<Sheet open={sheet === 'password'} title={t('more.changePassword')} onclose={() => (sheet = '')}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void changePassword(); }}>
    <Field label={t('more.currentPassword')} type="password" bind:value={currentPw} autocomplete="current-password" required />
    <Field label={t('common.newPassword')} type="password" bind:value={newPw} hint={t('more.newPasswordHint')} minlength={10} maxlength={128} autocomplete="new-password" required />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (sheet = '')}>{t('common.cancel')}</Button>
    <Button onclick={changePassword}>{t('more.changePassword')}</Button>
  {/snippet}
</Sheet>

<style>
  .mail {
    overflow-wrap: anywhere;
    text-align: end;
  }
</style>
