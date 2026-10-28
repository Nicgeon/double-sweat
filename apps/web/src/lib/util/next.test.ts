import { describe, expect, it } from 'vitest';
import { safeNext } from './next.ts';

describe('safeNext (Ziel nach der Anmeldung)', () => {
  it('lässt Pfade der App zu', () => {
    expect(safeNext('/bet')).toBe('/bet');
    expect(safeNext('/join/ABCD-EFGH?x=1')).toBe('/join/ABCD-EFGH?x=1');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'bet',
  ])('weist %s ab (kein offener Redirect)', (value) => {
    expect(safeNext(value)).toBe('/');
  });
});
