<script lang="ts">
  import { i18n, LANGUAGE_NAMES, LOCALES, type Locale, t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError, type PartnerColor, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Field from '#lib/components/Field.svelte';
  import InviteSheet from '#lib/components/InviteSheet.svelte';
  import PasswordSheet from '#lib/components/PasswordSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import Toggle from '#lib/components/Toggle.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { type ThemeChoice, theme } from '#lib/state/theme.svelte.ts';
  import { dateAndTime, longDate } from '#lib/util/format.ts';
  import { downloadExport } from '#lib/util/export.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import type { PushDistributor } from '#lib/native/plugins.ts';
  import { describeAgent, deviceLabel, PUSH_PROVIDER, pushActive, pushSupported, togglePushState } from '#lib/util/push.ts';

  type Device = { id: string; provider: string; deviceLabel: string | null; createdAt: number };
  type Sess = { id: string; kind: string; label: string | null; createdAt: number; lastSeenAt: number; current: boolean };

  const user = $derived(session.user);
  const me = $derived(session.me);
  const partner = $derived(session.partner);
  const team = $derived(session.team);

  let name = $state(session.user?.displayName ?? '');
  let reminder = $state(session.user?.reminderTime ?? '19:00');
  let timezone = $state(session.user?.timezone ?? 'Europe/Berlin');
  let color = $state<PartnerColor>(session.user?.color ?? 'ember');
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let pushOn = $state(false);
  let pushBusy = $state(false);
  let pushNote = $state<string | null>(null);
  let devices = $state<Device[]>([]);
  let sessions = $state<Sess[]>([]);
  let inviteOpen = $state(false);
  let sheet = $state<'' | 'email' | 'password' | 'export' | 'delete' | 'dissolve'>('');
  let newEmail = $state('');
  let currentPw = $state('');
  let newPw = $state('');
  let confirmDissolve = $state('');

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

  async function loadLists() {
    try {
      devices = unwrap(await api.GET('/api/v1/push/subscriptions')).subscriptions;
      sessions = unwrap(await api.GET('/api/v1/auth/sessions')).sessions;
    } catch (e) {
      fail(e);
    }
  }
  onMount(async () => {
    await loadLists();
    pushOn = await pushActive();
  });

  async function saveProfile() {
    saving = true;
    error = null;
    try {
      const body: { displayName?: string; reminderTime?: string; timezone?: string } = {};
      if (name.trim() !== user?.displayName) body.displayName = name.trim();
      if (reminder !== user?.reminderTime) body.reminderTime = reminder;
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

  /** Sprache umstellen: sofort in der Oberfläche, dauerhaft am Konto (Mitteilungen und Mails folgen ihr). */
  async function chooseLanguage(locale: Locale) {
    const before = i18n.current;
    i18n.set(locale);
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { locale } }));
      await session.refresh();
      ok(t('more.languageSaved'));
    } catch (e) {
      i18n.set(before);
      fail(e);
    }
  }

  async function saveColor(c: PartnerColor) {
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { color: c } }));
      await session.refresh();
      ok(t('more.colorSaved'));
    } catch (e) {
      color = user?.color ?? color;
      fail(e);
    }
  }

  const PROVIDER_NAMES: Record<string, string> = { webpush: 'Web Push', unifiedpush: 'UnifiedPush', fcm: 'FCM' };
  let pushChoices = $state<PushDistributor[] | null>(null);

  async function togglePush(on: boolean, choice?: string) {
    pushBusy = true;
    pushNote = null;
    pushChoices = null;
    try {
      const outcome = await togglePushState(on, deviceLabel(), choice);
      pushOn = outcome.active;
      pushChoices = outcome.choices;
      pushNote = outcome.note;
      if (!on) {
        const mine = devices.find((d) => d.provider === PUSH_PROVIDER);
        if (mine && !NATIVE) await api.DELETE('/api/v1/push/subscriptions/{id}', { params: { path: { id: mine.id } } });
      }
      await loadLists();
    } catch (e) {
      pushOn = !on;
      fail(e);
    } finally {
      pushBusy = false;
    }
  }

  async function testPush() {
    try {
      unwrap(await api.POST('/api/v1/push/test'));
      ok(t('more.pushTestSent'));
    } catch (e) {
      fail(e);
    }
  }
  async function removeDevice(id: string) {
    try {
      unwrap(await api.DELETE('/api/v1/push/subscriptions/{id}', { params: { path: { id } } }));
      await loadLists();
    } catch (e) {
      fail(e);
    }
  }
  async function endSession(id: string) {
    try {
      unwrap(await api.DELETE('/api/v1/auth/sessions/{id}', { params: { path: { id } } }));
      await loadLists();
    } catch (e) {
      fail(e);
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
      await loadLists();
    } catch (e) {
      fail(e);
    }
  }
  async function exportData(password: string) {
    const res = unwrap(await api.POST('/api/v1/me/export', { body: { password } }));
    sheet = '';
    await downloadExport(res.downloadUrl);
    ok(NATIVE ? t('more.exportReadyNative') : t('more.exportStarted'));
  }
  async function dissolve(password: string) {
    unwrap(await api.DELETE('/api/v1/team', { body: { password } }));
    sheet = '';
    await session.refresh();
  }
  async function deleteAccount(password: string) {
    unwrap(await api.DELETE('/api/v1/me', { body: { password } }));
    session.clear();
    await goto('/login');
  }
  async function resendVerification() {
    try {
      unwrap(await api.POST('/api/v1/auth/resend-verification'));
      ok(t('more.verificationResent'));
    } catch (e) {
      fail(e);
    }
  }
  async function changeServer() {
    await session.forgetServer();
    await goto('/server');
  }
  async function logout() {
    await session.logout();
    await goto('/login');
  }
</script>

<Page title={t('more.title')}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="cols">
    <div class="stack">
      <Card title={t('more.profile')}>
        <form class="form" onsubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
          <Field label={t('common.displayName')} bind:value={name} maxlength={40} required />
          <Field label={t('more.reminderAt')} type="time" bind:value={reminder} hint={t('more.reminderHint')} required />
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

      <Card title={t('more.colorCard')}>
        <ColorPicker bind:value={color} seat={me?.slot ?? 1} taken={partner ? { [partner.color]: partner.displayName } : {}} onchange={saveColor} />
      </Card>

      <Card title={t('more.languageCard')}>
        <Segmented
          label={t('common.language')}
          value={i18n.current}
          onchange={chooseLanguage}
          options={LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
        />
      </Card>

      <Card title={t('more.appearance')}>
        <Segmented
          label={t('more.appearance')}
          value={theme.choice}
          onchange={(v: ThemeChoice) => theme.set(v)}
          options={[
            { value: 'light', label: t('more.themeLight'), icon: 'sun' },
            { value: 'dark', label: t('more.themeDark'), icon: 'moon' },
            { value: 'system', label: t('more.themeSystem'), icon: 'monitor' },
          ]}
        />
      </Card>

      <Card title={t('more.pushCard')}>
        <div class="stack">
          {#if pushSupported()}
            <Toggle label={t('more.pushToggle')} hint="{NATIVE ? `${t('more.pushHintNative')} ` : ''}{t('more.pushHint', { name: partner?.displayName ?? t('more.pushHintPartner') })}" bind:checked={pushOn} disabled={pushBusy} onchange={togglePush} />
          {:else}
            <p class="small muted">{t('more.pushUnsupported')}</p>
          {/if}
          {#if pushNote}<Banner tone="info">{pushNote}</Banner>{/if}
          {#if pushChoices}
            <div class="stack">
              <p>{t('more.pushChoose')}</p>
              {#each pushChoices as d (d.id)}
                <Button variant="secondary" onclick={() => togglePush(true, d.id)}>{d.label}</Button>
                {#if d.hint}<p class="small muted">{d.hint}</p>{/if}
              {/each}
            </div>
          {/if}
          {#if devices.length > 0}
            <ul class="list">
              {#each devices as d (d.id)}
                <li class="line">
                  <span>{d.deviceLabel ?? d.provider}<span class="small muted"> · {t('more.deviceSince', { provider: PROVIDER_NAMES[d.provider] ?? d.provider, date: dateAndTime(d.createdAt) })}</span></span>
                  <Button variant="ghost" size="sm" icon="trash-2" iconOnly onclick={() => removeDevice(d.id)}>{t('more.removeDevice')}</Button>
                </li>
              {/each}
            </ul>
            <Button variant="secondary" icon="bell-ring" onclick={testPush}>{t('more.pushTest')}</Button>
          {/if}
        </div>
      </Card>
    </div>

    <div class="stack">
      <Card title={t('more.teamCard')}>
        <div class="stack">
          <p>{team?.name}</p>
          <ul class="list">
            {#each team?.members ?? [] as m (m.id)}
              <li class="line"><span>{m.isMe ? t('common.nameYou', { name: m.displayName }) : m.displayName}</span><span class="small muted">{m.timezone}</span></li>
            {/each}
          </ul>
          {#if team && !team.full}
            <Button icon="send" onclick={() => (inviteOpen = true)}>{t('more.invitePartner')}</Button>
            {#if team.invite}<p class="small muted">{t('more.inviteOpen', { date: longDate(new Date(team.invite.expiresAt).toISOString().slice(0, 10)) })}</p>{/if}
          {/if}
          <Button variant="secondary" icon="trash-2" onclick={() => (sheet = 'dissolve')}>{t('more.dissolve')}</Button>
        </div>
      </Card>

      <Card title={t('more.accountCard')}>
        <div class="stack">
          <div class="line"><span class="muted">{t('common.email')}</span><span>{user?.email}</span></div>
          {#if session.mailEnabled && user && !user.emailVerified}
            <Banner tone="warning" title={t('more.notVerifiedTitle')}>
              {t('more.notVerifiedBody')}
              {#snippet action()}<Button variant="secondary" size="sm" onclick={resendVerification}>{t('more.resend')}</Button>{/snippet}
            </Banner>
          {/if}
          <Button variant="secondary" icon="mail" onclick={() => (sheet = 'email')}>{t('more.changeEmail')}</Button>
          <Button variant="secondary" icon="key-round" onclick={() => (sheet = 'password')}>{t('more.changePassword')}</Button>
          <Button variant="secondary" icon="download" onclick={() => (sheet = 'export')}>{t('more.export')}</Button>
          <Button variant="secondary" icon="log-out" onclick={logout}>{t('common.signOut')}</Button>
          <Button variant="danger" icon="trash-2" onclick={() => (sheet = 'delete')}>{t('more.deleteAccount')}</Button>
        </div>
      </Card>

      {#if NATIVE && session.serverUrl}
        <Card title={t('more.serverCard')}>
          <div class="stack">
            <div class="line"><span class="muted">{t('more.connectedTo')}</span><span>{new URL(session.serverUrl).host}</span></div>
            <Button variant="secondary" icon="refresh-cw" onclick={changeServer}>{t('more.switchServer')}</Button>
          </div>
        </Card>
      {/if}

      <Card title={t('more.sessionsCard')}>
        <ul class="list">
          {#each sessions as s (s.id)}
            <li class="line">
              <span>{s.kind === 'web' ? describeAgent(s.label ?? '') : (s.label ?? t('more.appSession'))}{s.current ? ` ${t('more.thisDevice')}` : ''}<span class="small muted"> · {t('more.lastSeen', { date: dateAndTime(s.lastSeenAt) })}</span></span>
              {#if !s.current}<Button variant="ghost" size="sm" onclick={() => endSession(s.id)}>{t('common.signOut')}</Button>{/if}
            </li>
          {/each}
        </ul>
      </Card>
    </div>
  </div>
</Page>

<InviteSheet open={inviteOpen} onclose={() => (inviteOpen = false)} />

<PasswordSheet open={sheet === 'email'} title={t('more.emailSheet')} confirmLabel={t('common.change')} onclose={() => (sheet = '')} onconfirm={changeEmail}>
  <Field label={t('more.newEmail')} type="email" bind:value={newEmail} autocomplete="email" required />
</PasswordSheet>

<PasswordSheet open={sheet === 'export'} title={t('more.exportTitle')} confirmLabel={t('more.exportStart')} onclose={() => (sheet = '')} onconfirm={exportData}>
  <p>{t('more.exportBody')}</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'dissolve'} title={t('more.dissolveTitle')} confirmLabel={t('more.dissolve')} danger onclose={() => (sheet = '')} onconfirm={dissolve}>
  <p>{t('more.dissolveBody')}{partner ? ` ${t('more.dissolveNotify', { name: partner.displayName })}` : ''}</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'delete'} title={t('more.deleteTitle')} confirmLabel={t('more.deleteAccount')} danger onclose={() => (sheet = '')} onconfirm={deleteAccount}>
  <p>{t('more.deleteBody')}{partner ? ` ${t('more.deleteKeeps', { name: partner.displayName })}` : ''}</p>
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
