<script lang="ts" generics="T extends string">
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Option = { value: T; label: string; icon?: IconName };
  type Props = { options: Option[]; value?: T | null; label: string; wrap?: boolean; onchange?: (value: T) => void };
  let { options, value = $bindable(null), label, wrap = false, onchange }: Props = $props();
</script>

<div class="ds-seg {wrap ? 'ds-seg--wrap' : ''}" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      class="ds-seg__opt {o.value === value ? 'is-on' : ''}"
      onclick={() => {
        value = o.value;
        onchange?.(o.value);
      }}
    >
      {#if o.icon}<Icon name={o.icon} size={18} />{/if}
      <span>{o.label}</span>
    </button>
  {/each}
</div>
