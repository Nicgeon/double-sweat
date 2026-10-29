<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import StatusChip from './StatusChip.svelte';

  type Props = {
    recipientName: string;
    giverName: string;
    /** Der Betrachter hat die Belohnung verdient (nur er bestätigt, dass sie angekommen ist). */
    viewerIsRecipient: boolean;
    reward: string;
    week: string;
    received?: boolean;
    busy?: boolean;
    onreceive?: () => void;
  };
  let { recipientName, giverName, viewerIsRecipient, reward, week, received = false, busy = false, onreceive }: Props = $props();
  const title = $derived(viewerIsRecipient ? `Belohnung von ${giverName}` : `Deine Belohnung für ${recipientName}`);
</script>

<li class="ds-debt {received ? 'is-redeemed' : ''}">
  <span class="ds-debt__icon"><Icon name="trophy" size={22} /></span>
  <div class="ds-debt__text">
    <span class="ds-debt__title">{title}</span>
    <span class="ds-debt__sub">{reward} · {week}</span>
  </div>
  {#if received}
    <StatusChip status="done">Erhalten</StatusChip>
  {:else if viewerIsRecipient}
    <Button variant="secondary" size="sm" icon="check" loading={busy} onclick={onreceive}>Erhalten</Button>
  {:else}
    <StatusChip status="open">Fällig</StatusChip>
  {/if}
</li>
