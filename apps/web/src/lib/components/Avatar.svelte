<script lang="ts">
  import type { PartnerColor } from '#lib/api/client.ts';

  type Props = { seat?: number; color?: PartnerColor; name?: string; size?: 'sm' | 'md' | 'lg'; class?: string };
  let { seat = 1, color, name = '', size = 'md', class: className = '' }: Props = $props();
  const initials = $derived(
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase() || '?',
  );
</script>

<span class="ds-avatar {seat === 2 ? 'ds-p2' : 'ds-p1'} {color ? `ds-c-${color}` : ''} {size !== 'md' ? `ds-avatar--${size}` : ''} {className}" role="img" aria-label={name || undefined}>
  <span aria-hidden="true">{initials}</span>
</span>
