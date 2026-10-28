<script lang="ts">
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();
  let invite = $state<{ code: string; joinUrl: string; expiresAt: number } | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let copied = $state(false);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  async function create() {
    error = null;
    busy = true;
    try {
      invite = unwrap(await api.POST('/api/v1/teams/invites'));
      await session.refresh();
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }

  // Beim Öffnen sofort einen neuen Link erzeugen (der Code wird nur einmal angezeigt)
  $effect(() => {
    if (open && !invite && !busy) void create();
    if (!open) {
      invite = null;
      copied = false;
    }
  });

  async function copy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.joinUrl);
    copied = true;
  }
  const share = () => invite && navigator.share({ title: 'Double Sweat', text: 'Komm in mein Team.', url: invite.joinUrl });
  const days = (ms: number) => Math.max(1, Math.round((ms - Date.now()) / 86_400_000));
</script>

<Sheet {open} title="Partner einladen" {onclose}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if invite}
    <div class="stack">
      <p>Schick diesen Link an deinen Partner. Er gilt {days(invite.expiresAt)} Tage und funktioniert einmal.</p>
      <p class="code" data-testid="invite-link">{invite.joinUrl}</p>
      <p class="small muted">Oder gib den Code <strong>{invite.code}</strong> unter „Beitreten“ ein.</p>
      <div class="row">
        <Button icon="copy" variant="secondary" onclick={copy}>{copied ? 'Kopiert' : 'Link kopieren'}</Button>
        {#if canShare}<Button icon="share-2" variant="secondary" onclick={share}>Teilen</Button>{/if}
      </div>
    </div>
  {:else if busy}
    <p role="status">Einen Moment …</p>
  {/if}
</Sheet>
