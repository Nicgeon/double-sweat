<script lang="ts">
  import { t, tn, tSplit } from '#lib/i18n/index.svelte.ts';
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
      error = e instanceof ApiError ? e.message : t('common.failed');
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
  const share = () => invite && navigator.share({ title: 'Double Sweat', text: t('invite.shareText'), url: invite.joinUrl });
  const codeHint = $derived(tSplit('invite.codeHint', 'code'));
  const days = (ms: number) => Math.max(1, Math.round((ms - Date.now()) / 86_400_000));
</script>

<Sheet {open} title={t('invite.title')} {onclose}>
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if invite}
    <div class="stack">
      <p>{tn('invite.intro', days(invite.expiresAt))}</p>
      <p class="code" data-testid="invite-link">{invite.joinUrl}</p>
      <p class="small muted">{codeHint[0]}<strong>{invite.code}</strong>{codeHint[1]}</p>
      <div class="row">
        <Button icon="copy" variant="secondary" onclick={copy}>{copied ? t('invite.copied') : t('invite.copy')}</Button>
        {#if canShare}<Button icon="share-2" variant="secondary" onclick={share}>{t('invite.share')}</Button>{/if}
      </div>
    </div>
  {:else if busy}
    <p role="status">{t('common.wait')}</p>
  {/if}
</Sheet>
