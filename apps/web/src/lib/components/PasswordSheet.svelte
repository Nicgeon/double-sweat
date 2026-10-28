<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ApiError } from '#lib/api/client.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Sheet from './Sheet.svelte';

  type Props = {
    open: boolean;
    title: string;
    confirmLabel: string;
    danger?: boolean;
    onclose: () => void;
    /** Wirft bei Fehlern; bei Erfolg schließt der Aufrufer das Sheet. */
    onconfirm: (password: string) => Promise<void>;
    children?: Snippet;
  };
  let { open, title, confirmLabel, danger = false, onclose, onconfirm, children }: Props = $props();
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (!open) {
      password = '';
      error = null;
    }
  });

  async function submit() {
    error = null;
    busy = true;
    try {
      await onconfirm(password);
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<Sheet {open} {title} {onclose}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
    {@render children?.()}
    <Field label="Dein Passwort" type="password" bind:value={password} autocomplete="current-password" hint="Zur Sicherheit fragen wir hier noch einmal danach." required />
    {#if error}<Banner tone="error">{error}</Banner>{/if}
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Abbrechen</Button>
    <Button variant={danger ? 'danger' : 'primary'} loading={busy} onclick={submit}>{confirmLabel}</Button>
  {/snippet}
</Sheet>
