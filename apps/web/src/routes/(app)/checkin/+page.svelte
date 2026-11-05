<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { api, ApiError, type Checkin, unwrap, uploadCheckin } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Page from '#lib/components/Page.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import Sheet from '#lib/components/Sheet.svelte';
  import ShutterButton from '#lib/components/ShutterButton.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { cameraAvailable, cameraMessage, cameraProblem, type Facing, frameToJpeg, fileToJpeg, startCamera, stopStream, takeNativePhoto } from '#lib/util/camera.ts';
  import { longDate, weekdayDate } from '#lib/util/format.ts';
  import { isTag, type TagValue, tagList } from '#lib/util/tags.ts';
  import { pushWidget } from '#lib/util/widget.ts';
  import { streakStore } from '#lib/state/streak.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';

  type Step = 'already' | 'camera' | 'selfie' | 'file' | 'review' | 'done';
  const SELFIE_PREF = 'ds_selfie';
  const TAG_PREF = 'ds_last_tag';
  /** Sekunden Vorlauf vor dem automatischen Selfie (damit man sich auf das Bild einstellen kann). */
  const SELFIE_COUNTDOWN = 2;

  // Stand von heute kommt aus dem gemeinsamen Speicher (die Hülle hat ihn schon geladen): keine Ladeseite vor der Kamera
  const dash = $derived(todayStore.dashboard);
  const me = $derived(todayStore.me);
  const partner = $derived(todayStore.partner);
  /** Das Tageslimit ist erreicht: mehr Check-ins gehen heute nicht. */
  const limitReached = $derived(!!dash && !!me && !todayStore.canCheckin);

  let step = $state<Step>(untrack(() => limitReached) ? 'already' : 'camera');
  let video = $state<HTMLVideoElement>();
  let stream = $state<MediaStream | null>(null);
  let facing = $state<Facing>('environment');
  let cameraError = $state<string | null>(null);
  let photo = $state<Blob | null>(null);
  let photoUrl = $state<string | null>(null);
  let selfie = $state<Blob | null>(null);
  let selfieUrl = $state<string | null>(null);
  /** Nach dem Foto automatisch ein Selfie aufnehmen (Schalter in der Kamera, wird gemerkt). */
  let selfieWanted = $state(readPref());
  /** Das Selfie kommt aus dem Schalter (mit Vorlauf), nicht aus dem Knopf in der Vorschau. */
  let selfieAuto = $state(false);
  let countdown = $state<number | null>(null);
  let selfieMessage = $state<string | null>(null);
  /** Läuft die Live-Kamera? Sonst gibt es für das Selfie nur die Fotoauswahl. */
  let liveCamera = $state(true);
  let tag = $state<TagValue | null>(readTag());
  let note = $state('');
  /** Die Notiz ist eingeklappt, bis man sie braucht. */
  let noteOpen = $state(false);
  let noteBox = $state<HTMLElement>();
  /** Beim Verlassen mit ungesendetem Foto: wohin es danach ginge (öffnet die Rückfrage). */
  let discardTo = $state<URL | null>(null);
  let leaving = false;
  let busy = $state(false);
  let error = $state<string | null>(null);
  let result = $state<Checkin | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let selfieInput = $state<HTMLInputElement>();
  let cameraReady = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  /** Live-Kamera (Vorschau mit Auslöser), im Browser wie in der App. */
  const inCamera = $derived(step === 'camera' || step === 'selfie');
  const mirrored = $derived(step === 'selfie' || facing === 'user');

  /** Gemerkte Wahl; ohne Wahl ist das Selfie in der App an (gleich nach dem Foto, "überspringen" geht jederzeit), im Browser aus. */
  function readPref(): boolean {
    try {
      const stored = localStorage.getItem(SELFIE_PREF);
      return stored === null ? NATIVE : stored === '1';
    } catch {
      return NATIVE;
    }
  }
  function toggleSelfie() {
    selfieWanted = !selfieWanted;
    try {
      localStorage.setItem(SELFIE_PREF, selfieWanted ? '1' : '0');
    } catch {
      /* nicht kritisch */
    }
  }

  /** Zuletzt gewählte Trainingsart, vorbelegt (weniger Entscheidungen); unbekannte Werte werden ignoriert. */
  function readTag(): TagValue | null {
    try {
      const stored = localStorage.getItem(TAG_PREF);
      return isTag(stored) ? stored : null;
    } catch {
      return null;
    }
  }
  function rememberTag(value: string | null) {
    if (!value) return;
    try {
      localStorage.setItem(TAG_PREF, value);
    } catch {
      /* nicht kritisch */
    }
  }

  onMount(() => {
    // Die Kamera startet sofort; der frische Stand wird nebenher geholt (siehe Wechsel auf "already" unten)
    void todayStore.load().catch(() => {});
    if (step === 'camera') void openCamera();
  });
  // Stellt sich erst nach dem Abruf heraus, dass heute nichts mehr geht (etwa Check-ins vom anderen Gerät), und es
  // gibt noch kein Foto, wechselt die Seite dorthin; ein fertiges Foto wird nie weggenommen.
  $effect(() => {
    if (limitReached && !photo && (step === 'camera' || step === 'selfie' || step === 'file')) {
      clearCountdown();
      stopStream(stream);
      stream = null;
      step = 'already';
    }
  });

  // Verlassen mit ungesendetem Foto (Zurück, Schließen, Android-Zurück, Tab-Wechsel): erst fragen
  beforeNavigate((nav) => {
    if (leaving || !photo || step === 'done' || nav.type === 'leave') return;
    nav.cancel();
    if (nav.to) discardTo = nav.to.url;
  });
  function discard() {
    const to = discardTo;
    discardTo = null;
    if (!to) return;
    leaving = true;
    void goto(to);
  }
  onDestroy(() => {
    clearCountdown();
    stopStream(stream);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
  });

  /** App ohne Live-Kamera (Berechtigung verweigert): Kamera-App des Geräts; bei Abbruch bleibt die Auswahl. */
  async function nativeShoot() {
    cameraError = null;
    busy = true;
    try {
      const blob = await takeNativePhoto();
      if (blob) keep(blob);
      else step = 'file';
    } finally {
      busy = false;
    }
  }

  async function openCamera() {
    cameraError = null;
    cameraReady = false;
    stopStream(stream);
    stream = null;
    if (!cameraAvailable()) {
      liveCamera = false;
      cameraError = t('checkin.unavailable');
      step = 'file';
      return;
    }
    try {
      stream = await startCamera(facing);
      step = 'camera';
    } catch (e) {
      liveCamera = false;
      cameraError = `${cameraMessage(cameraProblem(e))} ${t('checkin.pickInstead')}`;
      step = 'file';
    }
  }

  // Videoelement mit dem Stream verbinden, sobald beides da ist
  $effect(() => {
    if (inCamera && video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  });

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    await openCamera();
  }

  function setPhoto(blob: Blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = blob;
    photoUrl = URL.createObjectURL(blob);
    stopStream(stream);
    stream = null;
  }

  function setSelfie(blob: Blob | null) {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    selfie = blob;
    selfieUrl = blob ? URL.createObjectURL(blob) : null;
  }

  function keep(blob: Blob) {
    setPhoto(blob);
    step = 'review';
  }

  async function shoot() {
    if (!video || video.videoWidth === 0) return;
    busy = true;
    try {
      setPhoto(await frameToJpeg(video));
      // Schalter an: gleich das Selfie hinterher (erst Rückkamera, dann Frontkamera, etwa eine Sekunde)
      if (selfieWanted && liveCamera) await openSelfie(true);
      else step = 'review';
    } finally {
      busy = false;
    }
  }

  async function picked(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    try {
      keep(await fileToJpeg(file));
    } finally {
      busy = false;
    }
  }

  // ----- Selfie (freiwillig) -----

  function clearCountdown() {
    clearInterval(timer);
    timer = undefined;
    countdown = null;
  }

  /** Startet den Vorlauf, sobald die Frontkamera ein Bild liefert; danach löst das Selfie von selbst aus. */
  function startCountdown() {
    clearCountdown();
    countdown = SELFIE_COUNTDOWN;
    timer = setInterval(() => {
      if (countdown === null) return;
      countdown -= 1;
      if (countdown <= 0) {
        clearCountdown();
        void takeSelfie();
      }
    }, 1000);
  }

  function onPlaying() {
    cameraReady = true;
    if (step === 'selfie' && selfieAuto && countdown === null && !selfie) startCountdown();
  }

  /** Selfie aufnehmen: mit der Frontkamera, sonst per Fotoauswahl. */
  async function openSelfie(auto: boolean) {
    selfieMessage = null;
    selfieAuto = auto;
    cameraReady = false;
    clearCountdown();
    stopStream(stream);
    stream = null;
    if (!liveCamera || !cameraAvailable()) {
      step = 'review';
      selfieInput?.click();
      return;
    }
    step = 'selfie';
    try {
      stream = await startCamera('user');
    } catch (e) {
      const problem = cameraProblem(e);
      // Nur wenn es dauerhaft nicht geht (verweigert, keine Frontkamera), bleibt die Live-Kamera für die Sitzung aus;
      // ein kurzer Fehler soll nicht dazu führen, dass jedes weitere Selfie über die Kamera-App läuft
      if (problem === 'denied' || problem === 'missing') liveCamera = false;
      selfieMessage = `${t('checkin.selfieFailed')} ${cameraMessage(problem)}`;
      step = 'review';
    }
  }

  async function takeSelfie() {
    if (!video || video.videoWidth === 0) return;
    clearCountdown();
    busy = true;
    try {
      setSelfie(await frameToJpeg(video));
      stopStream(stream);
      stream = null;
      step = 'review';
    } finally {
      busy = false;
    }
  }

  function skipSelfie() {
    clearCountdown();
    stopStream(stream);
    stream = null;
    step = 'review';
  }

  async function pickedSelfie(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    try {
      setSelfie(await fileToJpeg(file));
    } finally {
      busy = false;
    }
  }

  async function submit() {
    if (!photo) return;
    error = null;
    busy = true;
    try {
      result = await uploadCheckin(photo, tag, note, selfie);
      rememberTag(tag);
      step = 'done';
      const fresh = unwrap(await api.GET('/api/v1/dashboard'));
      todayStore.set(fresh);
      void pushWidget(fresh, streakStore.team);
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }

  async function openNote() {
    noteOpen = true;
    await tick();
    noteBox?.querySelector('textarea')?.focus();
  }

  async function retake() {
    photo = null;
    setSelfie(null);
    selfieMessage = null;
    error = null;
    await openCamera();
  }

  /** Noch ein Workout am selben Tag: zurück zur Kamera, mit dem frischen Stand aus dem Dashboard. */
  async function another() {
    photo = null;
    setSelfie(null);
    selfieMessage = null;
    result = null;
    tag = readTag();
    note = '';
    noteOpen = false;
    error = null;
    await openCamera();
  }

  /** Kopfzeile der Vorschau: Datum und, ab dem zweiten Mal, der wie vielte Check-in es heute ist. */
  const subtitle = $derived.by(() => {
    const date = me?.days.find((d) => d.isToday)?.date;
    const parts = [date ? weekdayDate(date) : null, me && me.checkinsToday > 0 ? t('checkin.nthToday', { n: me.checkinsToday + 1 }) : null];
    return parts.filter(Boolean).join(' · ') || undefined;
  });
</script>

{#if inCamera}
  <div class="camera" data-testid={step === 'selfie' ? 'selfie-camera' : 'camera'}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class="camera__video {mirrored ? 'camera__video--mirror' : ''} {cameraReady ? '' : 'camera__video--wait'}" playsinline muted aria-label={t('camera.view')} onplaying={onPlaying}></video>
    <div class="camera__top">
      <Button variant="ghost" iconOnly icon="x" class="camera__round" onclick={() => (step === 'selfie' ? skipSelfie() : goto('/'))}>{t('common.close')}</Button>
      <div class="camera__group">
        {#if step === 'camera'}
          <Button variant="ghost" iconOnly icon="user" class="camera__round {selfieWanted ? 'camera__round--on' : ''}" aria-pressed={selfieWanted} onclick={toggleSelfie}>{t('camera.selfieToggle')}</Button>
          <Button variant="ghost" iconOnly icon="switch-camera" class="camera__round" onclick={flip}>{t('camera.flip')}</Button>
        {:else}
          <Button variant="ghost" class="camera__round" onclick={skipSelfie}>{t('camera.selfieSkip')}</Button>
        {/if}
      </div>
    </div>
    {#if step === 'selfie'}
      <p class="camera__hint" role="status">{countdown !== null ? t('camera.selfieCountdown', { n: countdown }) : t('camera.selfieTitle')}</p>
    {/if}
    <div class="camera__bottom"><ShutterButton {busy} disabled={!cameraReady} label={step === 'selfie' ? t('camera.selfieShutter') : undefined} onclick={step === 'selfie' ? takeSelfie : shoot} /></div>
  </div>
{:else if step === 'review'}
  <form class="checkin" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
    <Page title={t('checkin.title')} {subtitle} backHref="/">
      <div class="checkin__body">
        {#if photoUrl}
          <div class="preview-wrap">
            <img class="preview" src={photoUrl} alt={t('checkin.photoAlt')} />
            {#if selfieUrl}<img class="selfie-inset" src={selfieUrl} alt={t('checkin.selfieAlt')} data-testid="selfie-preview" />{/if}
          </div>
        {/if}
        <div class="row row--tight">
          <Button variant="secondary" size="sm" icon="camera" onclick={retake}>{t('checkin.newPhoto')}</Button>
          {#if selfie}
            <Button variant="ghost" size="sm" icon="user" loading={busy} onclick={() => openSelfie(false)}>{t('checkin.selfieRetake')}</Button>
            <Button variant="ghost" size="sm" icon="x" iconOnly onclick={() => setSelfie(null)}>{t('checkin.selfieRemove')}</Button>
          {:else}
            <Button variant="ghost" size="sm" icon="user" loading={busy} onclick={() => openSelfie(false)}>{t('checkin.selfieAdd')}</Button>
          {/if}
        </div>
        {#if selfieMessage}<Banner tone="info">{selfieMessage}</Banner>{/if}
        <input bind:this={selfieInput} class="ds-sr" type="file" accept="image/*" capture="user" onchange={pickedSelfie} data-testid="selfie-input" tabindex="-1" aria-hidden="true" />

        <div class="stack stack--tight">
          <p class="ds-field__label">{t('checkin.workout')}</p>
          <Segmented scroll label={t('checkin.workout')} options={tagList()} bind:value={tag} />
        </div>

        {#if noteOpen || note}
          <div bind:this={noteBox}><Field label={t('checkin.note')} multiline maxlength={280} placeholder={t('checkin.notePlaceholder')} bind:value={note} /></div>
        {:else}
          <button type="button" class="ds-rowbtn" onclick={openNote}>
            <Icon name="plus" size={20} />
            <span class="ds-rowbtn__main">{t('checkin.noteAdd')}</span>
            <span class="muted">{t('checkin.optional')}</span>
          </button>
        {/if}
      </div>
    </Page>
    <!-- Feste Aktionsleiste: "Einchecken" bleibt sichtbar, auch bei langen Inhalten und offener Tastatur -->
    <div class="ds-actionbar">
      {#if error}<Banner tone="error">{error}</Banner>{/if}
      {#if me && me.checkinsToday > 0}
        <p class="ds-actionbar__hint">{t('checkin.countsOnce')}</p>
      {:else if partner}
        <p class="ds-actionbar__hint">{t('checkin.partnerSeesNow', { name: partner.displayName })}</p>
      {/if}
      <Button type="submit" size="lg" icon="check" fullWidth loading={busy}>{t('checkin.submit')}</Button>
    </div>
  </form>
{:else}
  <Page title={t('checkin.title')} backHref="/">
    {#if step === 'already'}
      <Banner tone="success" title={t('checkin.alreadyTitle')}>
        {t('checkin.alreadyBody', { n: dash?.maxCheckinsPerDay ?? 0 })}
      </Banner>
      <Button href="/">{t('common.toOverview')}</Button>
    {:else if step === 'file'}
      <div class="stack">
        {#if cameraError}<Banner tone="info">{cameraError}</Banner>{/if}
        <p class="lead">{t('checkin.fileLead')}</p>
        <input bind:this={fileInput} class="ds-sr" type="file" accept="image/*" capture={NATIVE ? undefined : "environment"} onchange={picked} data-testid="file-input" />
        {#if NATIVE}
          <Button size="lg" icon="camera" loading={busy} onclick={nativeShoot}>{t('checkin.takePhoto')}</Button>
          <Button variant="secondary" icon="image" onclick={() => fileInput?.click()}>{t('checkin.pickPhoto')}</Button>
        {:else}
          <Button size="lg" icon="camera" loading={busy} onclick={() => fileInput?.click()}>{t('checkin.takeOrPick')}</Button>
        {/if}
        {#if cameraAvailable()}<Button variant="ghost" onclick={() => { liveCamera = true; void openCamera(); }}>{t('checkin.retryCamera')}</Button>{/if}
      </div>
    {:else if step === 'done'}
      <div class="stack">
        <h2 class="auth__title">{t('checkin.doneTitle')}</h2>
        <p class="lead">
          {#if partner}{t('checkin.partnerSees', { name: partner.displayName })}{/if}
          {#if me?.goalDays}
            {me.neededDays > 0 ? tn('checkin.toGoal', me.neededDays) : t('checkin.goalReached')}
          {/if}
        </p>
        {#if me?.goalDays}<Banner tone="success" title={tn('days.progress', me.goalDays, { done: me.doneDays })}>{result ? longDate(result.localDate) : ''}</Banner>{/if}
        {#if me && dash && me.checkinsToday > 1}<p class="muted small">{t('checkin.wasNth', { n: me.checkinsToday })}</p>{/if}
        <Button size="lg" href="/">{t('checkin.done')}</Button>
        {#if me && dash && me.checkinsToday < dash.maxCheckinsPerDay}
          <Button variant="ghost" icon="camera" onclick={another}>{t('nav.checkinMore')}</Button>
        {/if}
      </div>
    {/if}
  </Page>
{/if}

<Sheet open={discardTo !== null} title={t('checkin.discardTitle')} onclose={() => (discardTo = null)}>
  <p>{t('checkin.discardBody')}</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (discardTo = null)}>{t('checkin.discardKeep')}</Button>
    <Button variant="danger" onclick={discard}>{t('checkin.discardYes')}</Button>
  {/snippet}
</Sheet>
