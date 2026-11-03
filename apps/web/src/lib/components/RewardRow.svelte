<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
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
  const who = $derived(viewerIsRecipient ? t('reward.fromGiver', { name: giverName }) : t('reward.forRecipient', { name: recipientName }));
</script>

<li class="ds-debt {received ? 'is-redeemed' : ''}">
  <span class="ds-debt__icon ds-debt__icon--{viewerIsRecipient ? 'in' : 'out'}"><Icon name="trophy" size={22} /></span>
  <div class="ds-debt__text">
    <span class="ds-debt__who">{who}</span>
    <span class="ds-debt__title">{reward}</span>
    <span class="ds-debt__sub">{t('deal.kindReward')} · {week}</span>
  </div>
  {#if received}
    <StatusChip status="done">{t('reward.received')}</StatusChip>
  {:else if viewerIsRecipient}
    <Button variant="secondary" size="sm" icon="check" loading={busy} onclick={onreceive}>{t('reward.received')}</Button>
  {:else}
    <StatusChip status="open">{t('deal.waiting', { name: recipientName })}</StatusChip>
  {/if}
</li>
