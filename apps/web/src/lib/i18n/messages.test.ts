import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { de } from './de.ts';
import { en } from './en.ts';
import { interpolate, LOCALES, pickLocale, translate, translatePlural } from './messages.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const keys = Object.keys(de) as (keyof typeof de)[];

describe('Wörterbücher', () => {
  it('haben dieselben Schlüssel', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
  });

  it('haben nirgends leere Texte', () => {
    for (const key of keys) {
      expect(de[key].trim(), `de ${key}`).not.toBe('');
      expect(en[key].trim(), `en ${key}`).not.toBe('');
    }
  });

  it('verwenden in beiden Sprachen dieselben Platzhalter', () => {
    for (const key of keys) {
      expect(placeholders(en[key]), key).toEqual(placeholders(de[key]));
    }
  });

  it('haben zu jeder Einzahl eine Mehrzahl (und umgekehrt)', () => {
    for (const key of keys) {
      if (key.endsWith('_one')) expect(keys, key).toContain(key.replace(/_one$/, '_other'));
      if (key.endsWith('_other')) expect(keys, key).toContain(key.replace(/_other$/, '_one'));
    }
  });

  it('Mehrzahltexte nennen die Anzahl als {n}, wenn der Text sie zeigt', () => {
    for (const key of keys) {
      if (!key.endsWith('_other')) continue;
      const one = key.replace(/_other$/, '_one') as keyof typeof de;
      expect(placeholders(de[one]), one).toEqual(placeholders(de[key]));
      expect(placeholders(en[one]), `en ${one}`).toEqual(placeholders(en[key]));
    }
  });

  it('enthalten keine doppelten Leerzeichen und beginnen nicht mit einem', () => {
    for (const key of keys) {
      for (const dict of [de, en]) {
        expect(dict[key], key).not.toMatch(/ {2,}/);
        expect(dict[key], key).toBe(dict[key].trimStart());
      }
    }
  });

  it('jeder Schlüssel wird im Quelltext verwendet', () => {
    const ROOT = join(import.meta.dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== 'i18n') walk(path);
        } else if (
          /\.(svelte|ts)$/.test(name) &&
          !name.endsWith('.test.ts') &&
          !name.endsWith('.d.ts')
        )
          files.push(path);
      }
    };
    walk(ROOT);
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    // Schlüssel, die aus Teilen zusammengesetzt werden: t(`tag.${value}`)
    const dynamic = [...source.matchAll(/`([a-z]+(?:\.[a-z]+)*\.)\$\{/g)].map(
      (m) => m[1] as string,
    );
    const unused = keys.filter((key) => {
      const base = key.replace(/_(one|other)$/, '');
      return !source.includes(`'${base}'`) && !dynamic.some((prefix) => base.startsWith(prefix));
    });
    expect(unused).toEqual([]);
  });
});

describe('translate', () => {
  it('setzt Platzhalter ein und lässt unbekannte stehen', () => {
    expect(interpolate('Hallo {name}, {x}', { name: 'Anna' })).toBe('Hallo Anna, {x}');
    expect(interpolate('Ohne Platzhalter')).toBe('Ohne Platzhalter');
    expect(interpolate('{n} Tage', { n: 3 })).toBe('3 Tage');
  });

  it('übersetzt in die gewählte Sprache', () => {
    expect(translate('de', 'common.back')).toBe('Zurück');
    expect(translate('en', 'common.back')).toBe('Back');
    expect(translate('en', 'join.title', { name: 'Anna' })).toBe('Anna invites you.');
  });

  it('wählt Einzahl und Mehrzahl je Sprache', () => {
    expect(translatePlural('de', 'streak.label', 1)).toBe('Woche in Serie');
    expect(translatePlural('de', 'streak.label', 2)).toBe('Wochen in Serie');
    expect(translatePlural('en', 'streak.label', 1)).toBe('week in a row');
    expect(translatePlural('en', 'streak.label', 0)).toBe('weeks in a row');
    expect(translatePlural('en', 'checkin.toGoal', 1)).toBe(
      '1 more day to reach your weekly goal.',
    );
    expect(translatePlural('de', 'days.progress', 3, { done: 2 })).toBe('2 von 3 Tagen');
  });
});

describe('pickLocale', () => {
  it.each([
    [['de-AT', 'en'], 'de'],
    [['fr-FR', 'en-GB'], 'en'],
    [['EN-us'], 'en'],
    [['fr', 'es'], null],
    [[], null],
    [[undefined, 'de'], 'de'],
  ] as const)('%j → %j', (candidates, expected) => {
    expect(pickLocale(candidates)).toBe(expected);
  });

  it('kennt die unterstützten Sprachen', () => {
    expect([...LOCALES]).toEqual(['de', 'en']);
  });
});
