<script lang="ts">
  import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';
  import type { Snippet } from 'svelte';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Status = 'done' | 'open' | 'risk' | 'missed';
  type Props = { status?: Status; children?: Snippet };
  let { status = 'open', children }: Props = $props();
  const META: Record<Status, { icon: IconName; label: MessageKey }> = {
    done: { icon: 'circle-check', label: 'status.done' },
    open: { icon: 'clock', label: 'status.open' },
    risk: { icon: 'timer', label: 'status.risk' },
    missed: { icon: 'circle-x', label: 'status.missed' },
  };
</script>

<span class="ds-chip ds-chip--{status}">
  <Icon name={META[status].icon} size={16} />
  {#if children}{@render children()}{:else}{t(META[status].label)}{/if}
</span>
