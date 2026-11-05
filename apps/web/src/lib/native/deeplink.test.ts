import { describe, expect, it } from 'vitest';
import { parseOpenLink } from './deeplink.ts';

const open = (path: string) => `doublesweat://open?path=${encodeURIComponent(path)}`;

describe('parseOpenLink (Tipp auf eine Mitteilung)', () => {
  it('nimmt die Seiten der App und ein Foto der Startseite', () => {
    for (const path of [
      '/',
      '/deal',
      '/history',
      '/checkin',
      '/notifications',
      '/profile',
      '/profile/health',
      '/?photo=abc_12-X',
    ]) {
      expect(parseOpenLink(open(path))).toBe(path);
    }
  });

  it('lehnt fremde Adressen, unbekannte Seiten und Auffälliges ab', () => {
    for (const path of [
      'https://evil.example/',
      '//evil.example',
      '/admin',
      '/deal/../more',
      '/deal#x',
      '/?photo=',
      '/?photo=a b',
      '/?photo=../../x',
      `/?photo=${'a'.repeat(41)}`,
      'deal',
      '',
    ]) {
      expect(parseOpenLink(open(path)), path).toBeNull();
    }
  });

  it('ignoriert andere Hosts, Schemata und fehlende Pfade', () => {
    expect(parseOpenLink('doublesweat://join?path=%2Fdeal')).toBeNull();
    expect(parseOpenLink('https://sweat.example/open?path=%2Fdeal')).toBeNull();
    expect(parseOpenLink('doublesweat://open')).toBeNull();
    expect(parseOpenLink('kein link')).toBeNull();
  });
});
