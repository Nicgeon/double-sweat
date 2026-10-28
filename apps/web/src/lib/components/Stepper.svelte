<script lang="ts">
  import Button from './Button.svelte';
  import type { PartnerColor } from '#lib/api/client.ts';

  type Props = { value: number; min?: number; max?: number; label: string; unit?: string; partner?: 1 | 2; color?: PartnerColor; onchange?: (v: number) => void };
  let { value = $bindable(), min = 1, max = 7, label, unit = 'Tage', partner = 1, color, onchange }: Props = $props();
  const set = (v: number) => {
    value = Math.min(max, Math.max(min, v));
    onchange?.(value);
  };
</script>

<div class="ds-stepper {partner === 2 ? 'ds-p2' : 'ds-p1'} {color ? `ds-c-${color}` : ''}" role="group" aria-label={label}>
  <div class="ds-stepper__row">
    <Button variant="secondary" size="lg" iconOnly icon="minus" onclick={() => set(value - 1)} disabled={value <= min}>Einen Tag weniger</Button>
    <div class="ds-stepper__value" aria-live="polite">
      <span class="ds-num ds-stepper__num">{value}</span>
      <span class="ds-stepper__unit">{unit} pro Woche</span>
    </div>
    <Button variant="secondary" size="lg" iconOnly icon="plus" onclick={() => set(value + 1)} disabled={value >= max}>Einen Tag mehr</Button>
  </div>
  <div class="ds-stepper__pips" aria-hidden="true">
    {#each Array.from({ length: max }, (_, i) => i) as i}
      <span class="ds-pip {i < value ? 'is-on' : ''}"></span>
    {/each}
  </div>
</div>
