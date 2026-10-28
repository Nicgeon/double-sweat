<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = { title?: string; tone?: 'sunken'; action?: Snippet; children: Snippet; class?: string; id?: string };
  let { title, tone, action, children, class: className = '', id }: Props = $props();
</script>

<section class="ds-card {tone ? `ds-card--${tone}` : ''} {className}" {id}>
  {#if title || action}
    <header class="ds-card__head">
      {#if title}<h2 class="ds-card__title">{title}</h2>{:else}<span></span>{/if}
      {@render action?.()}
    </header>
  {/if}
  {@render children()}
</section>
