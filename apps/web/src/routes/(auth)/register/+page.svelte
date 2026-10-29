<script lang="ts">
  import { goto } from '$app/navigation';
  import { ApiError, type PartnerColor } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Field from '#lib/components/Field.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { browserTimezone } from '#lib/util/next.ts';

  let displayName = $state('');
  let email = $state('');
  let password = $state('');
  let teamName = $state('Unser Team');
  let setupToken = $state('');
  let color = $state<PartnerColor>('ember');
  let error = $state<string | null>(null);
  let busy = $state(false);

  const mode = $derived(session.health?.signup.mode ?? 'token');
  const open = $derived(mode === 'open' || mode === 'token');
  const needsToken = $derived(session.health?.signup.requiresSetupToken ?? false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await session.register({
        email,
        password,
        displayName,
        timezone: browserTimezone(),
        teamName,
        color,
        setupToken: needsToken ? setupToken : undefined,
      });
      await goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Team gründen · Double Sweat</title></svelte:head>

{#if !open}
  <h1 class="auth__title">Hier geht es nur mit Einladung.</h1>
  <Banner tone="info" title="Die Registrierung ist eingeschränkt">
    Bitte den Administrator dieses Servers um einen Einladungslink.
  </Banner>
  <Button variant="secondary" href="/login">Zur Anmeldung</Button>
{:else}
  <h1 class="auth__title">Team gründen.</h1>
  <p class="auth__lead">Danach lädst du deinen Partner mit einem Link ein.</p>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  <form class="form" onsubmit={submit}>
    <Field label="Anzeigename" bind:value={displayName} maxlength={40} autocomplete="nickname" required />
    <Field label="E-Mail" type="email" bind:value={email} autocomplete="email" required />
    <Field label="Passwort" type="password" bind:value={password} hint="Mindestens 10 Zeichen." minlength={10} maxlength={128} autocomplete="new-password" required />
    <Field label="Teamname" bind:value={teamName} maxlength={60} />
    {#if needsToken}<Field label="Setup-Token" type="password" bind:value={setupToken} hint="Steht in der .env des Servers." autocomplete="off" required />{/if}
    <div>
      <p class="ds-field__label">Deine Farbe</p>
      <ColorPicker bind:value={color} seat={1} />
    </div>
    <div class="form__actions">
      <Button type="submit" size="lg" loading={busy}>Team gründen</Button>
      <Button variant="ghost" href="/login">Ich habe schon ein Konto</Button>
    </div>
  </form>
{/if}
