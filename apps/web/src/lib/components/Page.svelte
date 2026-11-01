<script lang="ts">
  import type { Snippet } from 'svelte';
  import AppBar from './AppBar.svelte';

  type Props = { title: string; subtitle?: string; backHref?: string; actions?: Snippet; children: Snippet };
  let { title, subtitle, backHref, actions, children }: Props = $props();
</script>

<svelte:head><title>{title} · Double Sweat</title></svelte:head>

<div class="page">
  <div class="page__bar"><AppBar {title} {subtitle} {backHref} {actions} /></div>
  <header class="page__head">
    <div class="page__heading">
      <h1 class="page__title">{title}</h1>
      {#if subtitle}<p class="page__sub">{subtitle}</p>{/if}
    </div>
    <div class="row">{@render actions?.()}</div>
  </header>
  <div class="page__body">{@render children()}</div>
</div>
