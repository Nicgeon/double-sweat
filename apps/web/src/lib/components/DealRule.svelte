<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /**
   * Eine Wenn-dann-Regel der Abmachung: "Schaffst du es: Ben gibt dir: Massage."
   * `done` steht für den guten Fall (Häkchen, grün), `alert` für den verfehlten (Kreuz, rosa); Symbol und Text
   * sagen es auch ohne Farbe.
   */
  type Props = {
    tone: 'done' | 'alert';
    label: string;
    /** Text hinter dem Fettgedruckten */
    children: Snippet;
    /** Kleine Zusatzzeilen darunter, zum Beispiel "ab Mo, 9. Nov.: Kino" */
    sub?: Snippet;
    /** Schaltfläche rechts (Ändern) */
    action?: Snippet;
  };
  let { tone, label, children, sub, action }: Props = $props();
</script>

<div class="ds-rule">
  <span class="ds-rule__ic ds-rule__ic--{tone}" aria-hidden="true"><Icon name={tone === 'done' ? 'check' : 'x'} size={14} strokeWidth={3} /></span>
  <div class="ds-rule__text">
    <b>{label}</b> {@render children()}
    {#if sub}<span class="ds-rule__sub">{@render sub()}</span>{/if}
  </div>
  {@render action?.()}
</div>
