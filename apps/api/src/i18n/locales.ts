/** Sprachen, in denen der Server Texte erzeugt (Mitteilungen, Mails, Fehlermeldungen). */
export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * Wählt aus einem Accept-Language-Header die bevorzugte unterstützte Sprache ("de-AT,de;q=0.9,en;q=0.8" → de).
 * Gibt null zurück, wenn keine der Sprachen unterstützt wird oder der Header fehlt.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .slice(0, 256)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
      const weight = q === undefined ? 1 : Number(q);
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const language = tag.split('-')[0];
    if (isLocale(language)) return language;
  }
  return null;
}
