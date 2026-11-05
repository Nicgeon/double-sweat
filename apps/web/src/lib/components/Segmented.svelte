<script lang="ts" generics="T extends string">
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Option = { value: T; label: string; icon?: IconName };
  /** `scroll`: eine einzeilige, seitlich wischbare Reihe (Chips); die gewählte Option wird in die Mitte gerückt. */
  type Props = { options: Option[]; value?: T | null; label: string; wrap?: boolean; scroll?: boolean; onchange?: (value: T) => void };
  let { options, value = $bindable(null), label, wrap = false, scroll = false, onchange }: Props = $props();
  let root = $state<HTMLElement>();

  $effect(() => {
    void value;
    if (!scroll || !root) return;
    const on = root.querySelector<HTMLElement>('.is-on');
    if (on) root.scrollLeft = on.offsetLeft - (root.clientWidth - on.offsetWidth) / 2;
  });
</script>

<div class="ds-seg {wrap || scroll ? 'ds-seg--wrap' : ''} {scroll ? 'ds-seg--scroll' : ''}" role="radiogroup" aria-label={label} bind:this={root}>
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
