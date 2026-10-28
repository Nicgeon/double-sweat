<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Status = 'done' | 'open' | 'risk' | 'missed';
  type Props = { status?: Status; children?: Snippet };
  let { status = 'open', children }: Props = $props();
  const META: Record<Status, { icon: IconName; label: string }> = {
    done: { icon: 'circle-check', label: 'Geschafft' },
    open: { icon: 'clock', label: 'Offen' },
    risk: { icon: 'timer', label: 'Auf der Kippe' },
    missed: { icon: 'circle-x', label: 'Verfehlt' },
  };
</script>

<span class="ds-chip ds-chip--{status}">
  <Icon name={META[status].icon} size={16} />
  {#if children}{@render children()}{:else}{META[status].label}{/if}
</span>
