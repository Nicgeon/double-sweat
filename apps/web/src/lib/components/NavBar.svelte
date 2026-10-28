<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  export type NavItem = { id: string; label: string; icon: IconName; href: string; badge?: number; primary?: boolean };
  type Props = { items: NavItem[]; current: string; variant?: 'bottom' | 'side'; header?: Snippet };
  let { items, current, variant = 'bottom', header }: Props = $props();
</script>

<nav class="ds-nav ds-nav--{variant}" aria-label="Hauptnavigation">
  {#if header}<div class="ds-nav__head">{@render header()}</div>{/if}
  <ul class="ds-nav__list">
    {#each items as it (it.id)}
      <li class={it.primary ? 'is-primary' : ''}>
        <a href={it.href} class="ds-nav__item {it.id === current ? 'is-on' : ''} {it.primary ? 'is-primary' : ''}" aria-current={it.id === current ? 'page' : undefined}>
          <span class="ds-nav__icon"><Icon name={it.icon} size={24} /></span>
          <span class="ds-nav__label">{it.label}</span>
          {#if it.badge}<span class="ds-nav__badge"><span class="ds-sr">Neu: </span>{it.badge}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>
