<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Page from '#lib/components/Page.svelte';
  import Toggle from '#lib/components/Toggle.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { dateAndTime } from '#lib/util/format.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import type { PushDistributor } from '#lib/native/plugins.ts';
  import { deviceLabel, PUSH_PROVIDER, pushActive, pushSupported, togglePushState } from '#lib/util/push.ts';

  type Prefs = NonNullable<typeof session.user>['notifications'];
  type Key = keyof Prefs;
  type Device = { id: string; provider: string; deviceLabel: string | null; createdAt: number };

  const ALL_ON: Prefs = { reminder: true, nudge: true, checkin: true, reaction: true, agreement: true, result: true, streak: true };
  const PROVIDER_NAMES: Record<string, string> = { webpush: 'Web Push', unifiedpush: 'UnifiedPush', fcm: 'FCM' };

  const partner = $derived(session.partner);
  const partnerName = $derived(partner?.displayName ?? t('nset.partnerFallback'));
  let prefs = $state<Prefs>({ ...ALL_ON, ...session.user?.notifications });
  let reminder = $state(session.user?.reminderTime ?? '19:00');
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let pushOn = $state(false);
  let pushBusy = $state(false);
  let pushNote = $state<string | null>(null);
  let pushChoices = $state<PushDistributor[] | null>(null);
  let devices = $state<Device[]>([]);

  const fail = (e: unknown) => {
    error = e instanceof ApiError ? e.message : t('common.failed');
    notice = null;
  };
  const ok = (text: string) => {
    notice = text;
    error = null;
  };

  async function loadDevices() {
    try {
      devices = unwrap(await api.GET('/api/v1/push/subscriptions')).subscriptions;
    } catch (e) {
      fail(e);
    }
  }
  onMount(async () => {
    await loadDevices();
    pushOn = await pushActive();
  });

  /** Schalter wirken sofort und werden gleich gespeichert; bei einem Fehler springt der Schalter zurück. */
  async function save(key: Key, value: boolean) {
    const patch: Partial<Prefs> = {};
    patch[key] = value;
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { notifications: patch } }));
      await session.refresh();
      ok(t('nset.saved'));
    } catch (e) {
      prefs[key] = !value;
      fail(e);
    }
  }

  async function saveTime() {
    if (!reminder || reminder === session.user?.reminderTime) return;
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { reminderTime: reminder } }));
      await session.refresh();
      ok(t('nset.saved'));
    } catch (e) {
      reminder = session.user?.reminderTime ?? reminder;
      fail(e);
    }
  }

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
      await loadDevices();
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
      await loadDevices();
    } catch (e) {
      fail(e);
    }
  }
</script>

<Page title={t('notifications.title')} backHref={page.url.searchParams.get('from') === 'profile' ? '/profile' : '/notifications'}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="stack stack--tight">
    <div class="ds-card ds-card--flush">
      <div class="ds-setting">
        {#if pushSupported()}
          <Toggle label={t('more.pushToggle')} hint="{NATIVE ? `${t('more.pushHintNative')} ` : ''}{t('nset.pushHint')}" bind:checked={pushOn} disabled={pushBusy} onchange={togglePush} />
        {:else}
          <p class="small muted">{t('more.pushUnsupported')}</p>
        {/if}
      </div>
    </div>
    {#if pushNote}<Banner tone="info">{pushNote}</Banner>{/if}
    {#if pushChoices}
      <div class="stack stack--tight">
        <p>{t('more.pushChoose')}</p>
        {#each pushChoices as d (d.id)}
          <Button variant="secondary" onclick={() => togglePush(true, d.id)}>{d.label}</Button>
          {#if d.hint}<p class="small muted">{d.hint}</p>{/if}
        {/each}
      </div>
    {/if}
  </div>

  <section class="stack stack--tight" aria-labelledby="nset-reminders">
    <h2 class="ds-overline" id="nset-reminders">{t('nset.groupReminders')}</h2>
    <div class="ds-card ds-card--flush">
      <div class="ds-setting"><Toggle label={t('nset.reminder')} hint={t('nset.reminderHint')} bind:checked={prefs.reminder} onchange={(v) => save('reminder', v)} /></div>
      {#if prefs.reminder}
        <label class="ds-setting">
          <span class="ds-setting__title">{t('nset.reminderTime')}</span>
          <input class="ds-setting__input" type="time" bind:value={reminder} onchange={saveTime} required />
        </label>
      {/if}
      <div class="ds-setting"><Toggle label={t('nset.streak')} hint={t('nset.streakHint')} bind:checked={prefs.streak} onchange={(v) => save('streak', v)} /></div>
    </div>
  </section>

  <section class="stack stack--tight" aria-labelledby="nset-partner">
    <h2 class="ds-overline" id="nset-partner">{t('nset.groupPartner', { name: partnerName })}</h2>
    <div class="ds-card ds-card--flush">
      <div class="ds-setting"><Toggle label={t('nset.checkin', { name: partnerName })} hint={t('nset.checkinHint', { name: partnerName })} bind:checked={prefs.checkin} onchange={(v) => save('checkin', v)} /></div>
      <div class="ds-setting"><Toggle label={t('nset.nudge')} bind:checked={prefs.nudge} onchange={(v) => save('nudge', v)} /></div>
      <div class="ds-setting"><Toggle label={t('nset.reaction')} bind:checked={prefs.reaction} onchange={(v) => save('reaction', v)} /></div>
    </div>
  </section>

  <section class="stack stack--tight" aria-labelledby="nset-week">
    <h2 class="ds-overline" id="nset-week">{t('nset.groupWeek')}</h2>
    <div class="ds-card ds-card--flush">
      <div class="ds-setting"><Toggle label={t('nset.result')} hint={t('nset.resultHint')} bind:checked={prefs.result} onchange={(v) => save('result', v)} /></div>
      <div class="ds-setting"><Toggle label={t('nset.agreement')} hint={t('nset.agreementHint', { name: partnerName })} bind:checked={prefs.agreement} onchange={(v) => save('agreement', v)} /></div>
    </div>
  </section>

  {#if devices.length > 0}
    <section class="stack stack--tight" aria-labelledby="nset-devices">
      <h2 class="ds-overline" id="nset-devices">{t('more.pushCard')}</h2>
      <ul class="list">
        {#each devices as d (d.id)}
          <li class="line">
            <span>{d.deviceLabel ?? d.provider}<span class="small muted"> · {t('more.deviceSince', { provider: PROVIDER_NAMES[d.provider] ?? d.provider, date: dateAndTime(d.createdAt) })}</span></span>
            <Button variant="ghost" size="sm" icon="trash-2" iconOnly onclick={() => removeDevice(d.id)}>{t('more.removeDevice')}</Button>
          </li>
        {/each}
      </ul>
      <div><Button variant="secondary" icon="bell-ring" onclick={testPush}>{t('more.pushTest')}</Button></div>
    </section>
  {/if}
</Page>
