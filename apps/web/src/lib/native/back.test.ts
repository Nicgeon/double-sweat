import { describe, expect, it } from 'vitest';
import { backAction, parentOf } from './back.ts';

describe('backAction (Zurück-Knopf der Android-App)', () => {
  it('beendet die App auf "Heute", auch wenn der Verlauf noch Einträge hat', () => {
    expect(backAction('/', '', true)).toEqual({ type: 'exit' });
    expect(backAction('/', '?photo=abc', false)).toEqual({ type: 'exit' });
  });

  it('führt von jeder Tab-Wurzel zu "Heute"', () => {
    for (const path of ['/history', '/deal', '/profile']) {
      expect(backAction(path, '', true)).toEqual({ type: 'goto', to: '/' });
    }
  });

  it('geht in einer Unterseite im Verlauf zurück, sonst zur Seite darüber', () => {
    expect(backAction('/profile/account', '', true)).toEqual({ type: 'history' });
    expect(backAction('/profile/account', '', false)).toEqual({ type: 'goto', to: '/profile' });
    expect(backAction('/notifications', '', false)).toEqual({ type: 'goto', to: '/' });
    expect(backAction('/checkin', '', false)).toEqual({ type: 'goto', to: '/' });
  });

  it('beendet die App vor der Anmeldung, wenn es keinen Verlauf gibt', () => {
    expect(backAction('/login', '', false)).toEqual({ type: 'exit' });
    expect(backAction('/server', '', false)).toEqual({ type: 'exit' });
    expect(backAction('/join/ABCD-EFGH', '', false)).toEqual({ type: 'exit' });
    expect(backAction('/register', '', true)).toEqual({ type: 'history' });
  });
});

describe('parentOf', () => {
  it('kennt die Seite über der Unterseite', () => {
    expect(parentOf('/profile/data', '')).toBe('/profile');
    expect(parentOf('/notifications/settings', '?from=profile')).toBe('/profile');
    expect(parentOf('/notifications/settings', '')).toBe('/notifications');
    expect(parentOf('/notifications', '')).toBe('/');
  });
});
