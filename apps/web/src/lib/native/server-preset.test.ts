import { describe, expect, it } from 'vitest';
import { resolvePreset } from './server-preset.ts';

describe('resolvePreset', () => {
  it('ohne Adresse gibt es keine Voreinstellung, auch nicht mit Sperre', () => {
    expect(resolvePreset({}, false)).toEqual({ url: null, locked: false });
    expect(resolvePreset({ url: '  ', locked: 'true' }, false)).toEqual({
      url: null,
      locked: false,
    });
  });

  it('schlägt die Adresse vor, solange nichts gesperrt ist', () => {
    expect(resolvePreset({ url: 'sweat.example.org' }, false)).toEqual({
      url: 'https://sweat.example.org',
      locked: false,
    });
    expect(resolvePreset({ url: 'https://sweat.example.org/', locked: 'false' }, false)).toEqual({
      url: 'https://sweat.example.org',
      locked: false,
    });
  });

  it('sperrt nur bei "true" (oder true) und nur mit Adresse', () => {
    expect(resolvePreset({ url: 'https://sweat.example.org', locked: 'true' }, false)).toEqual({
      url: 'https://sweat.example.org',
      locked: true,
    });
    expect(resolvePreset({ url: 'https://sweat.example.org', locked: true }, false).locked).toBe(
      true,
    );
    expect(resolvePreset({ url: 'https://sweat.example.org', locked: '1' }, false).locked).toBe(
      false,
    );
  });

  it('eine unbrauchbare Adresse ergibt keine halbe Voreinstellung', () => {
    for (const url of [
      'http://sweat.example.org',
      'ftp://x.org',
      'https://u:p@x.org',
      '://kaputt',
    ]) {
      expect(resolvePreset({ url, locked: 'true' }, false)).toEqual({ url: null, locked: false });
    }
  });

  it('http gilt nur im Testbuild', () => {
    expect(resolvePreset({ url: 'http://127.0.0.1:4173', locked: 'true' }, true)).toEqual({
      url: 'http://127.0.0.1:4173',
      locked: true,
    });
  });
});
