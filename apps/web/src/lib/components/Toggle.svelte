<script lang="ts">
  import Icon from './Icon.svelte';

  type Props = { checked: boolean; label: string; hint?: string; disabled?: boolean; onchange?: (checked: boolean) => void };
  let { checked = $bindable(), label, hint, disabled = false, onchange }: Props = $props();
  const id = $props.id();
</script>

<div class="ds-toggle">
  <div class="ds-toggle__text">
    <span class="ds-toggle__label" id="{id}-label">{label}</span>
    {#if hint}<span class="ds-toggle__hint">{hint}</span>{/if}
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby="{id}-label"
    {disabled}
    class="ds-switch {checked ? 'is-on' : ''}"
    onclick={() => {
      checked = !checked;
      onchange?.(checked);
    }}
  >
    <span class="ds-switch__knob">{#if checked}<Icon name="check" size={16} strokeWidth={3} />{/if}</span>
  </button>
</div>
