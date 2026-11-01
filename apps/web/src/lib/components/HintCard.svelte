<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  type Props = { icon: IconName; title: string; body?: string; action?: Snippet };
  let { icon, title, body, action }: Props = $props();
</script>

<section class="ds-hint" aria-label={title}>
  <span class="ds-hint__icon"><Icon name={icon} size={20} /></span>
  <div class="ds-hint__text">
    <strong>{title}</strong>
    {#if body}<span>{body}</span>{/if}
  </div>
  {@render action?.()}
</section>
