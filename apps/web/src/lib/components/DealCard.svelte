<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { PartnerColor } from '#lib/api/client.ts';
  import Avatar from './Avatar.svelte';

  /** Karte einer Person in der Abmachung: Name mit Farbe, darunter Ziel und Regeln. */
  type Props = {
    /** Name der Person (Initialen im Avatar) */
    name: string;
    /** Die Karte gehört dir: die Überschrift lautet dann "Anna (Du)" */
    you?: boolean;
    seat?: number;
    color?: PartnerColor;
    /** Überschrift (steht mit der id im Bereichsnamen) */
    id: string;
    action?: Snippet;
    children: Snippet;
  };
  let { name, you = false, seat = 1, color, id, action, children }: Props = $props();
</script>

<section class="ds-card" aria-labelledby={id}>
  <header class="ds-person__head">
    <div class="ds-person__who">
      <Avatar {seat} {color} {name} size="sm" />
      <h3 class="ds-person__name" {id}>{you ? t('common.nameYou', { name }) : name}</h3>
    </div>
    {@render action?.()}
  </header>
  {@render children()}
</section>
