<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Props = HTMLButtonAttributes & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'md' | 'lg' | 'sm';
    icon?: IconName;
    iconOnly?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    href?: string;
    children: Snippet;
  };
  let {
    variant = 'primary',
    size = 'md',
    icon,
    iconOnly = false,
    loading = false,
    fullWidth = false,
    href,
    class: className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  }: Props = $props();
  const classes = $derived(
    `ds-btn ds-btn--${variant} ${size !== 'md' ? `ds-btn--${size}` : ''} ${iconOnly ? 'ds-btn--icon' : ''} ${fullWidth ? 'ds-btn--block' : ''} ${className}`,
  );
</script>

{#if href}
  <a {href} class={classes}>
    {#if icon}<Icon name={icon} />{/if}
    {#if iconOnly}<span class="ds-sr">{@render children()}</span>{:else}{@render children()}{/if}
  </a>
{:else}
  <button {type} class={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {#if loading}
      <Icon name="loader-circle" class="ds-spin" />
    {:else if icon}
      <Icon name={icon} />
    {/if}
    {#if iconOnly}<span class="ds-sr">{@render children()}</span>{:else}{@render children()}{/if}
  </button>
{/if}
