<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Tone = 'info' | 'success' | 'warning' | 'error';
  type Props = { tone?: Tone; title?: string; children?: Snippet; action?: Snippet };
  let { tone = 'info', title, children, action }: Props = $props();
  const ICON: Record<Tone, IconName> = { info: 'info', success: 'circle-check', warning: 'triangle-alert', error: 'circle-alert' };
</script>

<div class="ds-banner ds-banner--{tone}" role={tone === 'error' ? 'alert' : 'status'}>
  <Icon name={ICON[tone]} size={22} />
  <div class="ds-banner__body">
    {#if title}<strong class="ds-banner__title">{title}</strong>{/if}
    {#if children}<span>{@render children()}</span>{/if}
  </div>
  {@render action?.()}
</div>
