<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { Snippet } from 'svelte';
  import { registerOverlay } from '#lib/state/overlays.ts';
  import Button from './Button.svelte';

  type Props = { open: boolean; title: string; onclose: () => void; children: Snippet; footer?: Snippet };
  let { open, title, onclose, children, footer }: Props = $props();
  let panel = $state<HTMLElement>();
  const titleId = $props.id();
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Offen gemeldet: der Zurück-Knopf der App schließt zuerst das oberste Fenster
  $effect(() => {
    if (!open) return;
    return registerOverlay(() => onclose());
  });

  $effect(() => {
    if (!open || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add('ds-lock');
    // Fokus auf das erste Bedienelement im Inhalt (nicht auf "Schließen")
    const body = panel.querySelector<HTMLElement>('.ds-sheet__body ' + FOCUSABLE.split(', ').join(', .ds-sheet__body '));
    (body ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onclose();
      }
      if (e.key === 'Tab' && panel) {
        const all = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = all[0];
        const last = all[all.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('ds-lock');
      previous?.focus?.();
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ds-sheet"
    onmousedown={(e) => {
      if (e.target === e.currentTarget) onclose();
    }}
  >
    <div class="ds-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} bind:this={panel}>
      <span class="ds-sheet__grip" aria-hidden="true"></span>
      <header class="ds-sheet__head">
        <h2 class="ds-sheet__title" id={titleId}>{title}</h2>
        <Button variant="ghost" iconOnly icon="x" onclick={onclose}>{t('common.close')}</Button>
      </header>
      <div class="ds-sheet__body">{@render children()}</div>
      {#if footer}<footer class="ds-sheet__foot">{@render footer()}</footer>{/if}
    </div>
  </div>
{/if}
