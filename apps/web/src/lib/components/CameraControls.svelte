<script lang="ts">
  import { t, i18n } from '#lib/i18n/index.svelte.ts';
  import { framePoint, hasTools, NO_CAPS, pinchValue, TrackControls } from '#lib/util/camera-controls.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  type Props = {
    stream: MediaStream | null;
    video: HTMLVideoElement | undefined;
    /** Die Vorschau ist gespiegelt (Frontkamera) */
    mirrored: boolean;
    /** Regler für Zoom und Belichtung zeigen (nicht beim Selfie, das von selbst ausgelöst wird) */
    tools?: boolean;
  };
  let { stream, video, mirrored, tools = true }: Props = $props();

  /** So lange bleibt der Ring nach einem Tipp stehen. */
  const RING_MS = 1100;
  /** Bis hierhin (Pixel) gilt eine Berührung noch als Tipp und nicht als Wischen. */
  const TAP_SLOP = 10;

  let controls = $state<TrackControls | null>(null);
  let caps = $state(NO_CAPS);
  let zoom = $state(1);
  let exposure = $state(0);
  let exposureOpen = $state(false);
  let ring = $state<{ x: number; y: number; id: number } | null>(null);
  let ringTimer: ReturnType<typeof setTimeout> | undefined;
  let ringCount = 0;
  let layer = $state<HTMLElement>();

  // Zu jedem neuen Bild gehört eine neue Kamera: alles zurück auf Anfang, Fokus und Belichtung automatisch
  $effect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      controls = null;
      caps = NO_CAPS;
      return;
    }
    const c = new TrackControls(track);
    controls = c;
    caps = c.caps;
    zoom = c.caps.zoom?.min ?? 1;
    exposure = 0;
    exposureOpen = false;
    ring = null;
    void c.applyAuto();
    // Manche Geräte melden Zoom und Belichtung erst, wenn das Bild läuft
    const reread = () => {
      if (c.refresh()) {
        caps = c.caps;
        zoom = c.caps.zoom?.min ?? 1;
        void c.applyAuto();
      }
    };
    const late = setTimeout(reread, 700);
    video?.addEventListener('playing', reread);
    return () => {
      clearTimeout(late);
      video?.removeEventListener('playing', reread);
      c.dispose();
    };
  });

  const showTools = $derived(tools && hasTools(caps));
  const numbers = $derived(new Intl.NumberFormat(i18n.current, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const signed = $derived(new Intl.NumberFormat(i18n.current, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }));
  const zoomText = $derived(`${numbers.format(zoom)}×`);
  const exposureText = $derived(signed.format(exposure));

  function changeZoom(value: number) {
    zoom = value;
    controls?.setZoom(value);
  }
  function changeExposure(value: number) {
    exposure = value;
    controls?.setExposure(value);
  }

  // ----- Berührung: Tipp = scharfstellen, zwei Finger = zoomen -----
  const pointers = new Map<number, { x: number; y: number }>();
  let tap: { id: number; x: number; y: number } | null = null;
  let pinch: { distance: number; base: number } | null = null;

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function down(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    layer?.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
    else {
      tap = null;
      if (pointers.size === 2 && caps.zoom) pinch = { distance: distance(), base: zoom };
    }
  }

  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
    if (pinch && pointers.size === 2 && caps.zoom) changeZoom(pinchValue(pinch.base, pinch.distance, distance(), caps.zoom));
  }

  function up(e: PointerEvent) {
    const was = tap;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    tap = null;
    if (was && was.id === e.pointerId && e.type === 'pointerup') void focus(e.clientX, e.clientY);
  }

  async function focus(x: number, y: number) {
    const c = controls;
    if (!c || !video) return;
    const box = video.getBoundingClientRect();
    const point = framePoint({ box, video: { width: video.videoWidth, height: video.videoHeight }, x, y, mirrored });
    if (!point) return;
    // Nur wenn die Kamera Fokus auf einen Punkt kennt, zeigt der Ring etwas an, das auch passiert
    if (!(await c.focusAt(point))) return;
    clearTimeout(ringTimer);
    ring = { x: x - box.left, y: y - box.top, id: ++ringCount };
    ringTimer = setTimeout(() => (ring = null), RING_MS);
    // Wie bei Handykameras: Nach dem Tippen liegt die Belichtung zum Verstellen bereit
    if (tools && caps.exposure && caps.zoom) exposureOpen = true;
  }
</script>

<!-- Die Fläche über dem Bild nimmt Gesten an; die Regler unten sind der Weg für alle, die nicht wischen können -->
<div
  bind:this={layer}
  class="camera__touch"
  data-testid="camera-touch"
  aria-hidden="true"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
></div>
{#if ring}
  {#key ring.id}<span class="camera__ring" style="left: {ring.x}px; top: {ring.y}px" data-testid="camera-ring" aria-hidden="true"></span>{/key}
{/if}

{#if showTools}
  <div class="camtools" role="group" aria-label={t('camera.tools')}>
    {#if caps.exposure && (exposureOpen || !caps.zoom)}
      <div class="camtools__row">
        <span class="camtools__lead" aria-hidden="true"><Icon name="sun" size={20} /></span>
        <input
          class="camtools__range"
          type="range"
          aria-label={t('camera.exposure')}
          min={caps.exposure.min}
          max={caps.exposure.max}
          step={caps.exposure.step}
          value={exposure}
          aria-valuetext={exposureText}
          oninput={(e) => changeExposure(e.currentTarget.valueAsNumber)}
        />
        <output class="camtools__value">{exposureText}</output>
        {#if exposure !== 0}<Button variant="ghost" iconOnly icon="refresh-cw" class="camera__round" onclick={() => changeExposure(0)}>{t('camera.exposureReset')}</Button>{/if}
      </div>
    {/if}
    {#if caps.zoom}
      <div class="camtools__row">
        <span class="camtools__lead" aria-hidden="true">{t('camera.zoom')}</span>
        <input
          class="camtools__range"
          type="range"
          aria-label={t('camera.zoom')}
          min={caps.zoom.min}
          max={caps.zoom.max}
          step={caps.zoom.step}
          value={zoom}
          aria-valuetext={zoomText}
          oninput={(e) => changeZoom(e.currentTarget.valueAsNumber)}
        />
        <output class="camtools__value">{zoomText}</output>
        {#if caps.exposure}
          <Button variant="ghost" iconOnly icon="sun" class="camera__round {exposureOpen ? 'camera__round--on' : ''}" aria-pressed={exposureOpen} onclick={() => (exposureOpen = !exposureOpen)}>{t('camera.exposureToggle')}</Button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
