<script lang="ts">
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
  import { CAMERA_MESSAGES, cameraAvailable, cameraProblem, type Facing, frameToJpeg, fileToJpeg, startCamera, stopStream, takeNativePhoto } from '#lib/util/camera.ts';
  import { longDate } from '#lib/util/format.ts';
  import { TAGS } from '#lib/util/tags.ts';

  type Step = 'loading' | 'already' | 'camera' | 'file' | 'review' | 'done';
  let step = $state<Step>('loading');
  let dash = $state<Dashboard | null>(null);
  let video = $state<HTMLVideoElement>();
  let stream: MediaStream | null = null;
  let facing = $state<Facing>('environment');
  let cameraError = $state<string | null>(null);
  let photo = $state<Blob | null>(null);
  let photoUrl = $state<string | null>(null);
  let tag = $state<string | null>(null);
  let note = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let result = $state<Checkin | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let cameraReady = $state(false);

  const me = $derived(dash?.members.find((m) => m.isMe));
  const partner = $derived(dash?.members.find((m) => !m.isMe));

  onMount(async () => {
    try {
      dash = unwrap(await api.GET('/api/v1/dashboard'));
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    }
    const mine = dash?.members.find((m) => m.isMe);
    if (dash && mine && mine.checkinsToday >= dash.maxCheckinsPerDay) {
      step = 'already';
      return;
    }
    await openCamera();
  });
  onDestroy(() => {
    stopStream(stream);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
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
    if (NATIVE) {
      await nativeShoot();
      return;
    }
    if (!cameraAvailable()) {
      cameraError = 'Die Kamera ist hier nicht verfügbar (sie braucht eine HTTPS-Verbindung).';
      step = 'file';
      return;
    }
    try {
      stream = await startCamera(facing);
      step = 'camera';
    } catch (e) {
      cameraError = `${CAMERA_MESSAGES[cameraProblem(e)]} Du kannst stattdessen ein Foto auswählen.`;
      step = 'file';
    }
  }

  // Videoelement mit dem Stream verbinden, sobald beides da ist
  $effect(() => {
    if (step === 'camera' && video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  });

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    await openCamera();
  }

  function keep(blob: Blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = blob;
    photoUrl = URL.createObjectURL(blob);
    stopStream(stream);
    stream = null;
    step = 'review';
  }

  async function shoot() {
    if (!video || video.videoWidth === 0) return;
    busy = true;
    try {
      keep(await frameToJpeg(video));
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

  async function submit() {
    if (!photo) return;
    error = null;
    busy = true;
    try {
      result = await uploadCheckin(photo, tag, note);
      step = 'done';
      dash = unwrap(await api.GET('/api/v1/dashboard'));
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }

  async function retake() {
    photo = null;
    error = null;
    await openCamera();
  }

  /** Noch ein Workout am selben Tag: zurück zur Kamera, mit dem frischen Stand aus dem Dashboard. */
  async function another() {
    photo = null;
    result = null;
    tag = null;
    note = '';
    error = null;
    await openCamera();
  }
</script>

{#if step === 'camera'}
  <div class="camera" data-testid="camera">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class="camera__video {facing === 'user' ? 'camera__video--mirror' : ''}" playsinline muted aria-label="Kamerabild" onplaying={() => (cameraReady = true)}></video>
    <div class="camera__top">
      <Button variant="ghost" iconOnly icon="x" class="camera__round" onclick={() => goto('/')}>Schließen</Button>
      <Button variant="ghost" iconOnly icon="switch-camera" class="camera__round" onclick={flip}>Kamera wechseln</Button>
    </div>
    <div class="camera__bottom"><ShutterButton {busy} disabled={!cameraReady} onclick={shoot} /></div>
  </div>
{:else}
  <Page title="Check-in" backHref="/">
    {#if step === 'loading'}
      <p class="muted" role="status">Lädt …</p>
    {:else if step === 'already'}
      <Banner tone="success" title="Für heute reicht es">
        Du hast heute {dash?.maxCheckinsPerDay} Check-ins gemacht, mehr sind pro Tag nicht möglich. Morgen geht es weiter.
      </Banner>
      <Button href="/">Zur Übersicht</Button>
    {:else if step === 'file'}
      <div class="stack">
        {#if cameraError}<Banner tone="info">{cameraError}</Banner>{/if}
        <p class="lead">Mach ein Foto von deinem Training oder wähle eines aus.</p>
        <input bind:this={fileInput} class="ds-sr" type="file" accept="image/*" capture={NATIVE ? undefined : "environment"} onchange={picked} data-testid="file-input" />
        {#if NATIVE}
          <Button size="lg" icon="camera" loading={busy} onclick={nativeShoot}>Foto aufnehmen</Button>
          <Button variant="secondary" icon="image" onclick={() => fileInput?.click()}>Foto auswählen</Button>
        {:else}
          <Button size="lg" icon="camera" loading={busy} onclick={() => fileInput?.click()}>Foto aufnehmen oder auswählen</Button>
          {#if cameraAvailable()}<Button variant="ghost" onclick={openCamera}>Kamera erneut versuchen</Button>{/if}
        {/if}
      </div>
    {:else if step === 'review'}
      <div class="cols">
        <div class="stack">
          {#if photoUrl}<img class="preview" src={photoUrl} alt="Dein Foto" />{/if}
        </div>
        <form class="stack" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p class="muted small">
            {#if me && me.checkinsToday > 0}
              Das ist dein {me.checkinsToday + 1}. Check-in heute. Für das Wochenziel zählt der Tag nur einmal.
            {:else}
              Das Datum bestimmt der Server.
            {/if}
          </p>
          <div>
            <p class="ds-field__label">Training</p>
            <Segmented wrap label="Training" options={TAGS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} bind:value={tag} />
          </div>
          <Field label="Notiz (optional)" multiline maxlength={280} placeholder="Wie war es?" bind:value={note} />
          {#if error}<Banner tone="error">{error}</Banner>{/if}
          <div class="form__actions">
            <Button type="submit" size="lg" icon="check" loading={busy}>Einchecken</Button>
            <Button variant="ghost" onclick={retake}>Neues Foto</Button>
          </div>
        </form>
      </div>
    {:else if step === 'done'}
      <div class="stack">
        <h2 class="auth__title">Eingecheckt.</h2>
        <p class="lead">
          {#if partner}{partner.displayName} sieht dein Foto.{/if}
          {#if me?.goalDays}
            {me.neededDays > 0 ? `Noch ${me.neededDays} ${me.neededDays === 1 ? 'Tag' : 'Tage'} bis zu deinem Wochenziel.` : 'Wochenziel erreicht.'}
          {/if}
        </p>
        {#if me?.goalDays}<Banner tone="success" title="{me.doneDays} von {me.goalDays} Tagen">{result ? longDate(result.localDate) : ''}</Banner>{/if}
        {#if me && dash && me.checkinsToday > 1}<p class="muted small">Das war dein {me.checkinsToday}. Check-in heute. Für das Wochenziel zählt der Tag nur einmal.</p>{/if}
        <Button size="lg" href="/">Zur Übersicht</Button>
        {#if me && dash && me.checkinsToday < dash.maxCheckinsPerDay}
          <Button variant="secondary" icon="camera" onclick={another}>Noch ein Workout eintragen</Button>
        {/if}
      </div>
    {/if}
  </Page>
{/if}
