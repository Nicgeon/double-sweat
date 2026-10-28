<script lang="ts">
  import type { PartnerColor } from '#lib/api/client.ts';
  import { PARTNER_COLORS } from '#lib/state/colors.ts';
  import Icon from './Icon.svelte';

  type Props = {
    value: PartnerColor;
    seat?: number;
    taken?: Partial<Record<PartnerColor, string>>;
    label?: string;
    onchange?: (value: PartnerColor) => void;
  };
  let { value = $bindable(), seat = 1, taken = {}, label = 'Deine Farbe', onchange }: Props = $props();
</script>

<div class="ds-colors {seat === 2 ? 'ds-p2' : 'ds-p1'}" role="radiogroup" aria-label={label}>
  {#each PARTNER_COLORS as c (c.value)}
    {@const by = taken[c.value]}
    <div class="ds-color">
      <button
        type="button"
        role="radio"
        aria-checked={c.value === value}
        aria-label={by ? `${c.label}, vergeben von ${by}` : c.label}
        disabled={Boolean(by)}
        class="ds-color__btn ds-c-{c.value}"
        onclick={() => {
          value = c.value;
          onchange?.(c.value);
        }}
      >
        {#if c.value === value}<Icon name="check" size={24} strokeWidth={3} />{/if}
      </button>
      <span class="ds-color__name">{by ? `von ${by}` : c.label}</span>
    </div>
  {/each}
</div>
