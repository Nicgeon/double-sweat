import { beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return import('./index.svelte.ts');
}

describe('Sprachwahl der Oberfläche', () => {
  beforeEach(() => vi.resetModules());

  it('beginnt außerhalb des Browsers auf Deutsch', async () => {
    const { i18n, t } = await fresh();
    expect(i18n.current).toBe('de');
    expect(t('common.back')).toBe('Zurück');
  });

  it('übernimmt die Standardsprache des Servers, solange nichts gewählt ist', async () => {
    const { i18n } = await fresh();
    i18n.useServerDefault('en');
    expect(i18n.current).toBe('en');
  });

  it('eine bewusste Wahl (oder die Sprache des Kontos) schlägt den Server-Standard', async () => {
    const { i18n, t } = await fresh();
    i18n.set('de');
    i18n.useServerDefault('en');
    expect(i18n.current).toBe('de');
    i18n.set('en');
    expect(t('common.back')).toBe('Back');
  });

  it('tn und tSplit folgen der gewählten Sprache', async () => {
    const { i18n, tn, tSplit } = await fresh();
    i18n.set('en');
    expect(tn('stepper.perWeek', 1)).toBe('day per week');
    expect(tn('stepper.perWeek', 3)).toBe('days per week');
    expect(tSplit('join.signedIn', 'name')).toEqual(['You are signed in as ', '.']);
    i18n.set('de');
    expect(tSplit('join.signedIn', 'name')).toEqual(['Du bist als ', ' angemeldet.']);
  });
});
