<script lang="ts">
  import { i18n, LANGUAGE_NAMES, LOCALES, t } from '#lib/i18n/index.svelte.ts';
</script>

<!-- Sprachwahl für Seiten vor der Anmeldung; nach der Anmeldung gilt die Sprache des Kontos (unter "Mehr") -->
<nav class="langs" aria-label={t('common.language')}>
  {#each LOCALES as locale (locale)}
    <button
      type="button"
      class="langs__opt {i18n.current === locale ? 'is-on' : ''}"
      lang={locale}
      aria-pressed={i18n.current === locale}
      onclick={() => i18n.set(locale)}
    >{LANGUAGE_NAMES[locale]}</button>
  {/each}
</nav>

<style>
  .langs {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    font-size: 0.875rem;
  }
  .langs__opt {
    background: none;
    border: 0;
    padding: 0.5rem 0.25rem;
    min-height: 44px;
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    font: inherit;
  }
  .langs__opt.is-on {
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
  }
</style>
