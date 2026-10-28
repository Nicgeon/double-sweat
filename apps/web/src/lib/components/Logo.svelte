<script lang="ts">
  type Props = { variant?: 'full' | 'mark'; size?: number; class?: string };
  let { variant = 'full', size = 32, class: className = '' }: Props = $props();
  const id = $props.id();
</script>

<span class="ds-logo {className}" style:--ds-logo="{size}px">
  <svg viewBox="0 0 96 64" width={(96 / 64) * size} height={size} aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="logo-{id}"><circle cx="32" cy="32" r="26" /></clipPath>
    </defs>
    <circle cx="32" cy="32" r="26" class="ds-logo__ember" />
    <rect x="34" y="6" width="52" height="52" rx="16" class="ds-logo__tide" />
    <rect x="34" y="6" width="52" height="52" rx="16" class="ds-logo__both" clip-path="url(#logo-{id})" />
  </svg>
  {#if variant === 'full'}
    <span class="ds-logo__word">Double Sweat</span>
  {:else}
    <span class="ds-sr">Double Sweat</span>
  {/if}
</span>
