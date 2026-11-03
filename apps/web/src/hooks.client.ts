import { t } from '#lib/i18n/index.svelte.ts';

/**
 * Unerwartete Fehler (etwas wirft beim Anzeigen einer Seite) bekommen eine verständliche Meldung statt SvelteKits
 * "Internal Error". Die technische Angabe steht auf der Fehlerseite aufklappbar, damit sich ein Fehler melden lässt.
 */
export const handleError = ({ error, status }: { error: unknown; status: number }) => {
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  return {
    message: status === 404 ? t('error.notFound') : t('error.generic'),
    detail: detail.slice(0, 300),
  };
};
