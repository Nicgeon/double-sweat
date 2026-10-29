import type { Context } from 'hono';
import type { Config } from '../config.js';
import { type Locale, localeFromAcceptLanguage } from './locales.js';

/** Sprache einer Anfrage: Accept-Language, sonst die Standardsprache des Servers. */
export function requestLocale(c: Context, config: Config): Locale {
  return localeFromAcceptLanguage(c.req.header('accept-language')) ?? config.defaultLocale;
}
