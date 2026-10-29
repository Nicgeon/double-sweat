<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  type Props = { title: string; backHref?: string; actions?: Snippet };
  let { title, backHref, actions }: Props = $props();
</script>

<header class="ds-appbar">
  {#if backHref}<Button variant="ghost" iconOnly icon="arrow-left" href={backHref}>{t('common.back')}</Button>{/if}
  <h1 class="ds-appbar__title">{title}</h1>
  <div class="ds-appbar__actions">{@render actions?.()}</div>
</header>
