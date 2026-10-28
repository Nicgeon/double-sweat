/** Nur Pfade innerhalb der App als Ziel nach der Anmeldung zulassen (kein offener Redirect). */
export function safeNext(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export const browserTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
