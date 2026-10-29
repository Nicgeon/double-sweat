<script lang="ts">
  import type { PartnerColor } from '#lib/api/client.ts';
  import type { IconName } from '#lib/icons.ts';
  import ApiImage from './ApiImage.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  type Props = {
    src?: string;
    alt?: string;
    seat?: number;
    color?: PartnerColor;
    name?: string;
    dateLabel?: string;
    tag?: string;
    tagIcon?: IconName;
    /** Reaktion auf das Foto: Symbol plus Text für Screenreader. */
    reaction?: { icon: IconName; label: string };
    empty?: string;
    onclick?: () => void;
  };
  let { src, alt = '', seat = 1, color, name, dateLabel, tag, tagIcon, reaction, empty, onclick }: Props = $props();
</script>



<figure class="ds-photo {seat === 2 ? 'ds-p2' : 'ds-p1'} {color ? `ds-c-${color}` : ''}">
  {#if empty}
    <div class="ds-photo__empty"><Icon name="image" size={28} /><span>{empty}</span></div>
  {:else}
    <ApiImage src={src ?? ''} {alt} />
  {/if}
  {#if name}<Avatar {seat} {color} {name} size="sm" class="ds-photo__who" />{/if}
  {#if reaction}<span class="ds-photo__react" title={reaction.label}><Icon name={reaction.icon} size={18} /><span class="ds-sr">{reaction.label}</span></span>{/if}
  {#if dateLabel || tag}
    <figcaption class="ds-photo__cap">
      {#if dateLabel}<span class="ds-photo__date">{dateLabel}</span>{/if}
      {#if tag}<span class="ds-photo__tag">{#if tagIcon}<Icon name={tagIcon} size={16} />{/if}{tag}</span>{/if}
    </figcaption>
  {/if}
  {#if onclick}
    <button type="button" class="ds-photo__open" {onclick} aria-label="Foto ansehen: {name ?? ''} {dateLabel ?? ''}"></button>
  {/if}
</figure>
