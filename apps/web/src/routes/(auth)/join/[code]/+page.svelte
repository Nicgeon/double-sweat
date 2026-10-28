<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError, type PartnerColor, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Field from '#lib/components/Field.svelte';
  import { PARTNER_COLORS } from '#lib/state/colors.ts';
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

  const taken = $derived(preview?.inviterColor ? { [preview.inviterColor]: preview.inviterName } : {});

  onMount(async () => {
    try {
      preview = unwrap(await api.GET('/api/v1/invites/{code}', { params: { path: { code } } }));
      status = 'ok';
      // Standardfarbe des zweiten Platzes, sonst die erste freie
      if (preview.inviterColor === color) color = PARTNER_COLORS.find((c) => c.value !== preview?.inviterColor)?.value ?? 'ember';
    } catch {
      status = 'invalid';
    }
  });

  async function register(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      const result = unwrap(
        await api.POST('/api/v1/auth/register', {
          body: { email, password, displayName, timezone: browserTimezone(), inviteCode: code, color },
        }),
      );
      session.adopt(result);
      await goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
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
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Einladung · Double Sweat</title><meta name="referrer" content="no-referrer" /></svelte:head>

{#if status === 'loading'}
  <p class="auth__lead" role="status">Einen Moment …</p>
{:else if status === 'invalid' || !preview}
  <h1 class="auth__title">Dieser Link gilt nicht mehr.</h1>
  <Banner tone="info" title="Neuen Link anfragen">
    Bitte die Person, die dich eingeladen hat, dir einen neuen Einladungslink zu schicken. Er ist 7 Tage gültig und funktioniert einmal.
  </Banner>
  <Button variant="secondary" href={session.user ? '/' : '/login'}>{session.user ? 'Zur App' : 'Zur Anmeldung'}</Button>
{:else}
  <h1 class="auth__title">{preview.inviterName} lädt dich ein.</h1>
  <p class="auth__lead">
    Ihr trainiert zu zweit und checkt mit einem Foto ein. Wer sein Wochenziel verfehlt, löst den Einsatz ein.
  </p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}

  {#if session.user && session.team}
    <Banner tone="info" title="Du bist schon in einem Team">Mit diesem Konto kannst du keinem zweiten Team beitreten.</Banner>
    <Button href="/">Zur App</Button>
  {:else if session.user}
    <p class="lead">Du bist als <strong>{session.user.displayName}</strong> angemeldet.</p>
    <div class="form__actions">
      <Button size="lg" loading={busy} onclick={joinExisting}>Beitreten</Button>
    </div>
  {:else}
    <form class="form" onsubmit={register}>
      <Field label="Anzeigename" bind:value={displayName} maxlength={40} autocomplete="nickname" required />
      <Field label="E-Mail" type="email" bind:value={email} autocomplete="email" required />
      <Field label="Passwort" type="password" bind:value={password} hint="Mindestens 10 Zeichen." minlength={10} maxlength={128} autocomplete="new-password" required />
      <div>
        <p class="ds-field__label">Deine Farbe</p>
        <ColorPicker bind:value={color} seat={2} {taken} />
      </div>
      <div class="form__actions">
        <Button type="submit" size="lg" loading={busy}>Beitreten</Button>
        <Button variant="ghost" href="/login?next={encodeURIComponent(`/join/${code}`)}">Ich habe schon ein Konto</Button>
      </div>
    </form>
  {/if}
{/if}
