<script lang="ts">
  import type { Snippet } from 'svelte';
  import AppBar from './AppBar.svelte';

  type Props = { title: string; backHref?: string; actions?: Snippet; children: Snippet };
  let { title, backHref, actions, children }: Props = $props();
</script>

<svelte:head><title>{title} · Double Sweat</title></svelte:head>

<div class="page">
  <div class="page__bar"><AppBar {title} {backHref} {actions} /></div>
  <header class="page__head">
    <h1 class="page__title">{title}</h1>
    <div class="row">{@render actions?.()}</div>
  </header>
  <div class="page__body">{@render children()}</div>
</div>
