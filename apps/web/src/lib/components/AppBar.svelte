<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  type Props = { title: string; subtitle?: string; backHref?: string; actions?: Snippet };
  let { title, subtitle, backHref, actions }: Props = $props();
</script>

<header class="ds-appbar">
  {#if backHref}<Button variant="ghost" iconOnly icon="arrow-left" href={backHref}>{t('common.back')}</Button>{/if}
  {#if subtitle}
    <div class="ds-appbar__heading">
      <h1 class="ds-appbar__title">{title}</h1>
      <span class="ds-appbar__sub">{subtitle}</span>
    </div>
  {:else}
    <h1 class="ds-appbar__title">{title}</h1>
  {/if}
  <div class="ds-appbar__actions">{@render actions?.()}</div>
</header>
