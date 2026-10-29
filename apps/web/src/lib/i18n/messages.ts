import { de, type MessageKey } from './de.ts';
import { en } from './en.ts';

export type { MessageKey } from './de.ts';

/** Sprachen der Oberfläche. Eine weitere Sprache: Wörterbuch anlegen (siehe README), hier eintragen. */
export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

/** Name einer Sprache in dieser Sprache selbst (für die Auswahl). */
export const LANGUAGE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English' };

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { de, en };

export type Params = Record<string, string | number>;

/** Schlüssel mit Einzahl-/Mehrzahlform (`name_one`, `name_other`), angesprochen über `name`. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_one` ? Base : never;
}[MessageKey];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Erste unterstützte Sprache einer Liste wie navigator.languages ("de-AT" zählt als "de"). */
export function pickLocale(candidates: readonly (string | null | undefined)[]): Locale | null {
  for (const tag of candidates) {
    const language = tag?.toLowerCase().split('-')[0];
    if (isLocale(language)) return language;
  }
  return null;
}

/** Setzt `{name}`-Platzhalter ein; unbekannte bleiben stehen, damit der Fehler sichtbar wird. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Text in einer Sprache. Fehlt der Schlüssel dort, gilt die deutsche Fassung (nie ein leerer Text). */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return interpolate(DICTIONARIES[locale][key] || de[key], params);
}

/** Text mit Mehrzahl: Platzhalter `{n}` ist die Anzahl. */
export function translatePlural(
  locale: Locale,
  base: PluralKey,
  count: number,
  params?: Params,
): string {
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
  return translate(locale, `${base}_${form}` as MessageKey, { n: count, ...params });
}
