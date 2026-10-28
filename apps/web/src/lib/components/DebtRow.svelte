<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import StatusChip from './StatusChip.svelte';

  type Props = {
    debtorName: string;
    creditorName: string;
    viewerIsCreditor: boolean;
    bet: string;
    week: string;
    redeemed?: boolean;
    busy?: boolean;
    onredeem?: () => void;
  };
  let { debtorName, creditorName, viewerIsCreditor, bet, week, redeemed = false, busy = false, onredeem }: Props = $props();
  const title = $derived(viewerIsCreditor ? `${debtorName} schuldet dir` : `Du schuldest ${creditorName}`);
</script>

<li class="ds-debt {redeemed ? 'is-redeemed' : ''}">
  <span class="ds-debt__icon"><Icon name="gift" size={22} /></span>
  <div class="ds-debt__text">
    <span class="ds-debt__title">{title}</span>
    <span class="ds-debt__sub">{bet} · {week}</span>
  </div>
  {#if redeemed}
    <StatusChip status="done">Eingelöst</StatusChip>
  {:else if viewerIsCreditor}
    <Button variant="secondary" size="sm" icon="check" loading={busy} onclick={onredeem}>Eingelöst</Button>
  {:else}
    <StatusChip status="open" />
  {/if}
</li>
