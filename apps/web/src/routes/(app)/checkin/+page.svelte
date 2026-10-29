<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError, type Checkin, type Dashboard, unwrap, uploadCheckin } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Field from '#lib/components/Field.svelte';
  import Page from '#lib/components/Page.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import ShutterButton from '#lib/components/ShutterButton.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { cameraAvailable, cameraMessage, cameraProblem, type Facing, frameToJpeg, fileToJpeg, startCamera, stopStream, takeNativePhoto } from '#lib/util/camera.ts';
  import { longDate } from '#lib/util/format.ts';
  import { tagList } from '#lib/util/tags.ts';

  type Step = 'loading' | 'already' | 'camera' | 'selfie' | 'file' | 'review' | 'done';
  const SELFIE_PREF = 'ds_selfie';
  /** Sekunden Vorlauf vor dem automatischen Selfie (damit man sich auf das Bild einstellen kann). */
  const SELFIE_COUNTDOWN = 2;

  let step = $state<Step>('loading');
  let dash = $state<Dashboard | null>(null);
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
  /** Läuft die Live-Kamera? Sonst gibt es für das Selfie nur die Fotoauswahl bzw. die Gerätekamera. */
  let liveCamera = $state(true);
  let tag = $state<string | null>(null);
  let note = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let result = $state<Checkin | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let selfieInput = $state<HTMLInputElement>();
  let cameraReady = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const me = $derived(dash?.members.find((m) => m.isMe));
  const partner = $derived(dash?.members.find((m) => !m.isMe));
  const inCamera = $derived(step === 'camera' || step === 'selfie');
  const mirrored = $derived(step === 'selfie' || facing === 'user');

  function readPref(): boolean {
    try {
      return localStorage.getItem(SELFIE_PREF) === '1';
    } catch {
      return false;
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

  onMount(async () => {
    try {
      dash = unwrap(await api.GET('/api/v1/dashboard'));
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    }
    const mine = dash?.members.find((m) => m.isMe);
    if (dash && mine && mine.checkinsToday >= dash.maxCheckinsPerDay) {
      step = 'already';
      return;
    }
    await openCamera();
  });
  onDestroy(() => {
    clearCountdown();
    stopStream(stream);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
  });

  /** App: Kamera des Geräts; bei Abbruch bleibt die Auswahl (erneut aufnehmen oder Foto auswählen). */
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
    if (NATIVE) {
      liveCamera = false;
      await nativeShoot();
      return;
    }
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

  /** Selfie aufnehmen: mit der Frontkamera, in der App mit der Gerätekamera, sonst per Fotoauswahl. */
  async function openSelfie(auto: boolean) {
    selfieMessage = null;
    selfieAuto = auto;
    cameraReady = false;
    clearCountdown();
    stopStream(stream);
    stream = null;
    if (NATIVE) return nativeSelfie();
    if (!liveCamera || !cameraAvailable()) {
      step = 'review';
      selfieInput?.click();
      return;
    }
    step = 'selfie';
    try {
      stream = await startCamera('user');
    } catch (e) {
      liveCamera = false;
      selfieMessage = `${t('checkin.selfieFailed')} ${cameraMessage(cameraProblem(e))}`;
      step = 'review';
    }
  }

  async function nativeSelfie() {
    step = 'review';
    busy = true;
    try {
      const blob = await takeNativePhoto();
      if (blob) setSelfie(blob);
    } finally {
      busy = false;
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
      step = 'done';
      dash = unwrap(await api.GET('/api/v1/dashboard'));
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
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
    tag = null;
    note = '';
    error = null;
    await openCamera();
  }
</script>

{#if inCamera}
  <div class="camera" data-testid={step === 'selfie' ? 'selfie-camera' : 'camera'}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class="camera__video {mirrored ? 'camera__video--mirror' : ''}" playsinline muted aria-label={t('camera.view')} onplaying={onPlaying}></video>
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
{:else}
  <Page title={t('checkin.title')} backHref="/">
    {#if step === 'loading'}
      <p class="muted" role="status">{t('common.loading')}</p>
    {:else if step === 'already'}
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
          {#if cameraAvailable()}<Button variant="ghost" onclick={() => { liveCamera = true; void openCamera(); }}>{t('checkin.retryCamera')}</Button>{/if}
        {/if}
      </div>
    {:else if step === 'review'}
      <div class="cols">
        <div class="stack">
          {#if photoUrl}
            <div class="preview-wrap">
              <img class="preview" src={photoUrl} alt={t('checkin.photoAlt')} />
              {#if selfieUrl}<img class="selfie-inset" src={selfieUrl} alt={t('checkin.selfieAlt')} data-testid="selfie-preview" />{/if}
            </div>
          {/if}
        </div>
        <form class="stack" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p class="muted small">
            {#if me && me.checkinsToday > 0}
              {t('checkin.nthToday', { n: me.checkinsToday + 1 })}
            {:else}
              {t('checkin.serverDate')}
            {/if}
          </p>
          <div>
            <p class="ds-field__label">{t('checkin.workout')}</p>
            <Segmented wrap label={t('checkin.workout')} options={tagList()} bind:value={tag} />
          </div>
          <Field label={t('checkin.note')} multiline maxlength={280} placeholder={t('checkin.notePlaceholder')} bind:value={note} />
          <div class="stack">
            <p class="ds-field__label">{t('checkin.selfie')}</p>
            {#if selfie}
              <div class="row">
                <Button variant="secondary" size="sm" icon="user" loading={busy} onclick={() => openSelfie(false)}>{t('checkin.selfieRetake')}</Button>
                <Button variant="ghost" size="sm" icon="x" onclick={() => setSelfie(null)}>{t('checkin.selfieRemove')}</Button>
              </div>
            {:else}
              <p class="muted small">{t('checkin.selfieHint')}</p>
              <div class="row">
                <Button variant="secondary" size="sm" icon="user" loading={busy} onclick={() => openSelfie(false)}>{t('checkin.selfieAdd')}</Button>
              </div>
            {/if}
            {#if selfieMessage}<Banner tone="info">{selfieMessage}</Banner>{/if}
            <input bind:this={selfieInput} class="ds-sr" type="file" accept="image/*" capture="user" onchange={pickedSelfie} data-testid="selfie-input" tabindex="-1" aria-hidden="true" />
          </div>
          {#if error}<Banner tone="error">{error}</Banner>{/if}
          <div class="form__actions">
            <Button type="submit" size="lg" icon="check" loading={busy}>{t('checkin.submit')}</Button>
            <Button variant="ghost" onclick={retake}>{t('checkin.newPhoto')}</Button>
          </div>
        </form>
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
        <Button size="lg" href="/">{t('common.toOverview')}</Button>
        {#if me && dash && me.checkinsToday < dash.maxCheckinsPerDay}
          <Button variant="secondary" icon="camera" onclick={another}>{t('checkin.another')}</Button>
        {/if}
      </div>
    {/if}
  </Page>
{/if}
