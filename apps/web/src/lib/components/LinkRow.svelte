<script lang="ts">
  import type { IconName } from '#lib/icons.ts';
  import Icon from './Icon.svelte';

  /** Zeile in einer randlosen Karte (`ds-card--flush`): Symbol, Titel, kurze Beschreibung und ein Pfeil zum Ziel. */
  type Props = { href: string; icon: IconName; title: string; caption?: string };
  let { href, icon, title, caption }: Props = $props();
</script>

<a class="ds-msg" {href}>
  <span class="ds-tile"><Icon name={icon} size={20} /></span>
  <span class="ds-msg__text">
    <span class="ds-msg__title ds-msg__title--lead">{title}</span>
    {#if caption}<span class="ds-msg__cap">{caption}</span>{/if}
  </span>
  <Icon name="chevron-right" size={20} class="ds-msg__go" />
</a>
