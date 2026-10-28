import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTNER_COLORS } from './colors.ts';

describe('Farbpalette', () => {
  const tokens = JSON.parse(
    readFileSync(new URL('../../../../../design/tokens.json', import.meta.url), 'utf8'),
  ) as { color: { tokens: { name: string }[] } };
  const names = new Set(tokens.color.tokens.map((t) => t.name));

  it('hat zu jeder Farbe die vier Tokens im Designsystem', () => {
    for (const { value } of PARTNER_COLORS) {
      for (const token of [value, `on-${value}`, `${value}-ink`, `${value}-soft`]) {
        expect(names.has(token), token).toBe(true);
      }
    }
  });

  it('stimmt mit der Palette der API überein', async () => {
    const api = await import('../../../../api/src/domain/colors.ts');
    expect(PARTNER_COLORS.map((c) => c.value)).toEqual([...api.PARTNER_COLORS]);
  });
});
