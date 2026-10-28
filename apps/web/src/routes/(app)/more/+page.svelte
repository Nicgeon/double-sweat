<script lang="ts">
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
  import { currentSubscription, describeAgent, deviceLabel, disablePush, enablePush, pushSupported } from '#lib/util/push.ts';

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
  const fail = (e: unknown) => (error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.');
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
    pushOn = (await currentSubscription()) !== null;
  });

  async function saveProfile() {
    saving = true;
    error = null;
    try {
      const body: { displayName?: string; reminderTime?: string; timezone?: string } = {};
      if (name.trim() !== user?.displayName) body.displayName = name.trim();
      if (reminder !== user?.reminderTime) body.reminderTime = reminder;
      if (timezone !== user?.timezone && timezone !== user?.pendingTimezone) body.timezone = timezone;
      if (Object.keys(body).length === 0) return ok('Nichts zu speichern.');
      unwrap(await api.PATCH('/api/v1/me', { body }));
      await session.refresh();
      ok(body.timezone ? 'Gespeichert. Die neue Zeitzone gilt ab Montag.' : 'Gespeichert.');
    } catch (e) {
      fail(e);
    } finally {
      saving = false;
    }
  }

  async function saveColor(c: PartnerColor) {
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { color: c } }));
      await session.refresh();
      ok('Farbe gespeichert.');
    } catch (e) {
      color = user?.color ?? color;
      fail(e);
    }
  }

  async function togglePush(on: boolean) {
    pushBusy = true;
    pushNote = null;
    try {
      if (on) {
        const res = await enablePush(deviceLabel());
        if (res.status !== 'ok') {
          pushOn = false;
          pushNote =
            res.status === 'denied'
              ? 'Die Erlaubnis wurde abgelehnt. Du kannst sie in den Browser-Einstellungen ändern.'
              : res.status === 'disabled'
                ? 'Dieser Server hat Web Push ausgeschaltet.'
                : 'Dieser Browser unterstützt keine Push-Benachrichtigungen (auf dem iPhone nur als installierte App).';
        }
      } else {
        const sub = await currentSubscription();
        const mine = devices.find((d) => d.provider === 'webpush');
        if (sub && mine) await api.DELETE('/api/v1/push/subscriptions/{id}', { params: { path: { id: mine.id } } });
        await disablePush();
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
      ok('Testbenachrichtigung gesendet. Sie erscheint auch unter „Benachrichtigungen“.');
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
    ok(res.status === 'verification_sent' ? 'Wir haben dir einen Bestätigungslink an die neue Adresse geschickt.' : 'E-Mail-Adresse geändert.');
  }
  async function changePassword() {
    error = null;
    try {
      unwrap(await api.POST('/api/v1/auth/change-password', { body: { currentPassword: currentPw, newPassword: newPw } }));
      sheet = '';
      currentPw = newPw = '';
      ok('Passwort geändert. Andere Geräte wurden abgemeldet.');
      await loadLists();
    } catch (e) {
      fail(e);
    }
  }
  async function exportData(password: string) {
    const res = unwrap(await api.POST('/api/v1/me/export', { body: { password } }));
    sheet = '';
    window.location.assign(res.downloadUrl);
    ok('Der Download startet. Der Link gilt 60 Sekunden.');
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
      ok('Bestätigungsmail gesendet.');
    } catch (e) {
      fail(e);
    }
  }
  async function logout() {
    await session.logout();
    await goto('/login');
  }
</script>

<Page title="Mehr">
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="cols">
    <div class="stack">
      <Card title="Profil">
        <form class="form" onsubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
          <Field label="Anzeigename" bind:value={name} maxlength={40} required />
          <Field label="Erinnerung um" type="time" bind:value={reminder} hint="Wenn du an einem Tag noch einchecken musst, erinnern wir dich dann." required />
          <div class="ds-field">
            <label class="ds-field__label" for="tz">Zeitzone</label>
            <div class="ds-field__control">
              <select id="tz" class="ds-field__input" bind:value={timezone}>
                {#each zones as z}<option value={z}>{z}</option>{/each}
              </select>
            </div>
            {#if user?.pendingTimezone}
              <p class="ds-field__hint">Wechsel auf {user.pendingTimezone} gilt ab dem nächsten Montag.</p>
            {:else}
              <p class="ds-field__hint">Ein Wechsel gilt erst ab dem nächsten Wochenstart.</p>
            {/if}
          </div>
          <Button type="submit" loading={saving}>Speichern</Button>
        </form>
      </Card>

      <Card title="Deine Farbe">
        <ColorPicker bind:value={color} seat={me?.slot ?? 1} taken={partner ? { [partner.color]: partner.displayName } : {}} onchange={saveColor} />
      </Card>

      <Card title="Darstellung">
        <Segmented
          label="Darstellung"
          value={theme.choice}
          onchange={(v: ThemeChoice) => theme.set(v)}
          options={[
            { value: 'light', label: 'Hell', icon: 'sun' },
            { value: 'dark', label: 'Dunkel', icon: 'moon' },
            { value: 'system', label: 'System', icon: 'monitor' },
          ]}
        />
      </Card>

      <Card title="Benachrichtigungen">
        <div class="stack">
          {#if pushSupported()}
            <Toggle label="Push auf diesem Gerät" hint="Erinnerung am Abend und Anstupser von {partner?.displayName ?? 'deinem Partner'}." bind:checked={pushOn} disabled={pushBusy} onchange={togglePush} />
          {:else}
            <p class="small muted">Push braucht eine HTTPS-Verbindung und einen unterstützten Browser. Alles erscheint auch unter „Benachrichtigungen“.</p>
          {/if}
          {#if pushNote}<Banner tone="info">{pushNote}</Banner>{/if}
          {#if devices.length > 0}
            <ul class="list">
              {#each devices as d (d.id)}
                <li class="line">
                  <span>{d.deviceLabel ?? d.provider}<span class="small muted"> · seit {dateAndTime(d.createdAt)}</span></span>
                  <Button variant="ghost" size="sm" icon="trash-2" iconOnly onclick={() => removeDevice(d.id)}>Gerät entfernen</Button>
                </li>
              {/each}
            </ul>
            <Button variant="secondary" icon="bell-ring" onclick={testPush}>Testbenachrichtigung senden</Button>
          {/if}
        </div>
      </Card>
    </div>

    <div class="stack">
      <Card title="Team">
        <div class="stack">
          <p>{team?.name}</p>
          <ul class="list">
            {#each team?.members ?? [] as m (m.id)}
              <li class="line"><span>{m.displayName}{m.isMe ? ' (Du)' : ''}</span><span class="small muted">{m.timezone}</span></li>
            {/each}
          </ul>
          {#if team && !team.full}
            <Button icon="send" onclick={() => (inviteOpen = true)}>Partner einladen</Button>
            {#if team.invite}<p class="small muted">Eine Einladung ist offen bis {longDate(new Date(team.invite.expiresAt).toISOString().slice(0, 10))}.</p>{/if}
          {/if}
          <Button variant="secondary" icon="trash-2" onclick={() => (sheet = 'dissolve')}>Team auflösen</Button>
        </div>
      </Card>

      <Card title="Konto">
        <div class="stack">
          <div class="line"><span class="muted">E-Mail</span><span>{user?.email}</span></div>
          {#if session.mailEnabled && user && !user.emailVerified}
            <Banner tone="warning" title="E-Mail noch nicht bestätigt">
              Ohne Bestätigung kannst du dein Passwort nicht per Mail zurücksetzen.
              {#snippet action()}<Button variant="secondary" size="sm" onclick={resendVerification}>Erneut senden</Button>{/snippet}
            </Banner>
          {/if}
          <Button variant="secondary" icon="mail" onclick={() => (sheet = 'email')}>E-Mail ändern</Button>
          <Button variant="secondary" icon="key-round" onclick={() => (sheet = 'password')}>Passwort ändern</Button>
          <Button variant="secondary" icon="download" onclick={() => (sheet = 'export')}>Meine Daten exportieren</Button>
          <Button variant="secondary" icon="log-out" onclick={logout}>Abmelden</Button>
          <Button variant="danger" icon="trash-2" onclick={() => (sheet = 'delete')}>Konto löschen</Button>
        </div>
      </Card>

      <Card title="Geräte und Sitzungen">
        <ul class="list">
          {#each sessions as s (s.id)}
            <li class="line">
              <span>{s.kind === 'web' ? describeAgent(s.label ?? '') : (s.label ?? 'App')}{s.current ? ' (dieses Gerät)' : ''}<span class="small muted"> · zuletzt {dateAndTime(s.lastSeenAt)}</span></span>
              {#if !s.current}<Button variant="ghost" size="sm" onclick={() => endSession(s.id)}>Abmelden</Button>{/if}
            </li>
          {/each}
        </ul>
      </Card>
    </div>
  </div>
</Page>

<InviteSheet open={inviteOpen} onclose={() => (inviteOpen = false)} />

<PasswordSheet open={sheet === 'email'} title="E-Mail ändern" confirmLabel="Ändern" onclose={() => (sheet = '')} onconfirm={changeEmail}>
  <Field label="Neue E-Mail-Adresse" type="email" bind:value={newEmail} autocomplete="email" required />
</PasswordSheet>

<PasswordSheet open={sheet === 'export'} title="Daten exportieren" confirmLabel="Export starten" onclose={() => (sheet = '')} onconfirm={exportData}>
  <p>Du bekommst ein ZIP mit allen eigenen Daten und Fotos. Vom Partner ist nur der Anzeigename enthalten.</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'dissolve'} title="Team auflösen" confirmLabel="Team auflösen" danger onclose={() => (sheet = '')} onconfirm={dissolve}>
  <p>Beide Konten bleiben bestehen. Alle Check-ins, Fotos, Einsätze und Schulden des Teams werden endgültig gelöscht.{partner ? ` ${partner.displayName} wird benachrichtigt.` : ''}</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'delete'} title="Konto löschen" confirmLabel="Konto löschen" danger onclose={() => (sheet = '')} onconfirm={deleteAccount}>
  <p>Konto löschen? Deine Check-ins und Fotos werden endgültig entfernt.{partner ? ` ${partner.displayName} behält sein Konto.` : ''}</p>
</PasswordSheet>

<Sheet open={sheet === 'password'} title="Passwort ändern" onclose={() => (sheet = '')}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void changePassword(); }}>
    <Field label="Aktuelles Passwort" type="password" bind:value={currentPw} autocomplete="current-password" required />
    <Field label="Neues Passwort" type="password" bind:value={newPw} hint="Mindestens 10 Zeichen. Andere Geräte werden abgemeldet." minlength={10} maxlength={128} autocomplete="new-password" required />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (sheet = '')}>Abbrechen</Button>
    <Button onclick={changePassword}>Passwort ändern</Button>
  {/snippet}
</Sheet>
