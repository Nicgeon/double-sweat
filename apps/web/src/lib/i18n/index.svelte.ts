import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  type MessageKey,
  type Params,
  type PluralKey,
  pickLocale,
  translate,
  translatePlural,
} from './messages.ts';

export type { Locale, MessageKey } from './messages.ts';
export { LANGUAGE_NAMES, LOCALES } from './messages.ts';

const KEY = 'ds_language';
const inBrowser = typeof window !== 'undefined';

function stored(): Locale | null {
  try {
    const value = localStorage.getItem(KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null; // privater Modus oder gesperrter Speicher
  }
}

function fromBrowser(): Locale | null {
  if (!inBrowser) return null;
  return pickLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * Sprache der Oberfläche. Reihenfolge: Konto (nach der Anmeldung) → zuletzt gewählte → Browsersprache →
 * Standardsprache des Servers → Deutsch. Außerhalb des Browsers (Tests) gilt immer Deutsch.
 */
class I18n {
  current = $state<Locale>(stored() ?? fromBrowser() ?? DEFAULT_LOCALE);
  /** Ob die Sprache bewusst gewählt oder aus dem Konto übernommen wurde (dann ersetzt der Server-Standard sie nicht). */
  private decided = stored() !== null || fromBrowser() !== null;

  constructor() {
    this.apply();
  }

  /** Setzt die Sprache und merkt sie sich für die Seiten vor der Anmeldung. */
  set(locale: Locale): void {
    this.decided = true;
    this.current = locale;
    try {
      localStorage.setItem(KEY, locale);
    } catch {
      /* nicht kritisch */
    }
    this.apply();
  }

  /** Standardsprache des Servers: gilt nur, wenn weder Auswahl noch Browser eine Sprache nahelegen. */
  useServerDefault(locale: Locale): void {
    if (this.decided) return;
    this.current = locale;
    this.apply();
  }

  private apply(): void {
    if (inBrowser) document.documentElement.lang = this.current;
  }
}

export const i18n = new I18n();

/** Übersetzt einen Schlüssel in die aktuelle Sprache. Liest den Zustand, deshalb aktualisiert sich die Oberfläche beim Wechsel. */
export const t = (key: MessageKey, params?: Params): string => translate(i18n.current, key, params);

/** Text mit Einzahl/Mehrzahl, `{n}` ist die Anzahl. */
export const tn = (base: PluralKey, count: number, params?: Params): string =>
  translatePlural(i18n.current, base, count, params);

const SPLIT = '\u0000';

/**
 * Text um eine Stelle herum, an der die Oberfläche etwas Eigenes einsetzt (Fettdruck, Code):
 * `[davor, danach]` zu "Du bist als {name} angemeldet." Die Stelle ist der Platzhalter `slot`.
 */
export function tSplit(key: MessageKey, slot: string, params?: Params): [string, string] {
  const [before = '', after = ''] = translate(i18n.current, key, {
    ...params,
    [slot]: SPLIT,
  }).split(SPLIT);
  return [before, after];
}

/** Aktuelle Sprache für Intl-Formatierer. */
export const currentLocale = (): Locale => i18n.current;
