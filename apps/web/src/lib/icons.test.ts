import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons.ts';

describe('Icons', () => {
  it('entsprechen genau den Dateien in design/icons', () => {
    const files = readdirSync(new URL('../../../../design/icons', import.meta.url))
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4))
      .sort();
    expect(Object.keys(ICONS).sort()).toEqual(files);
  });

  it('haben nur bekannte Formen', () => {
    for (const shapes of Object.values(ICONS)) {
      for (const [tag] of shapes) {
        expect(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']).toContain(tag);
      }
    }
  });
});
