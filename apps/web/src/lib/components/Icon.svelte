<script lang="ts">
  import { ICONS, type IconName } from '#lib/icons.ts';

  type Props = { name: IconName; size?: number; title?: string; strokeWidth?: number; class?: string };
  let { name, size = 20, title, strokeWidth = 2, class: className = '' }: Props = $props();
  const shapes = $derived(ICONS[name]);
</script>

<svg
  class="ds-icon {className}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : true}
  focusable="false"
>
  {#each shapes as [tag, attrs]}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
