import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseTrustProxy } from '../src/config.js';

const base = { PUBLIC_URL: 'https://ds.example.org', SIGNUP_MODE: 'invite-only' };

describe('loadConfig', () => {
  it('übernimmt sinnvolle Standardwerte', () => {
    const c = loadConfig({ ...base });
    expect(c.signupMode).toBe('invite-only');
    expect(c.secureCookies).toBe(true);
    expect(c.publicOrigin).toBe('https://ds.example.org');
    expect(c.maxUploadBytes).toBe(12 * 1024 * 1024);
    expect(c.smtp).toBeNull();
    expect(c.host).toBe('127.0.0.1');
  });

  it('Standard-Signup-Modus ist "token" und verlangt einen Setup-Token', () => {
    expect(() => loadConfig({ PUBLIC_URL: 'https://ds.example.org' })).toThrow(/SETUP_TOKEN/);
  });

  it.each(['CHANGE_ME', 'changeme', 'secret', 'your-token-here'])(
    'lehnt den Platzhalter "%s" ab',
    (value) => {
      expect(() => loadConfig({ PUBLIC_URL: 'https://x.org', SETUP_TOKEN: value })).toThrow(
        /Platzhalter/,
      );
    },
  );

  it('lehnt zu kurze Setup-Tokens ab', () => {
    expect(() => loadConfig({ PUBLIC_URL: 'https://x.org', SETUP_TOKEN: 'kurz' })).toThrow(
      /16 Zeichen/,
    );
  });

  it('verlangt https außer für localhost', () => {
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'http://ds.example.org' })).toThrow(/https/);
    const local = loadConfig({ ...base, PUBLIC_URL: 'http://localhost:3000' });
    expect(local.secureCookies).toBe(false);
    expect(
      loadConfig({ ...base, PUBLIC_URL: 'http://nas.lan', ALLOW_INSECURE_HTTP: 'true' })
        .secureCookies,
    ).toBe(false);
  });

  it('lehnt PUBLIC_URL mit Unterpfad ab', () => {
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'https://x.org/app' })).toThrow(/Unterpfad/);
  });

  it('behandelt leere Variablen wie nicht gesetzt', () => {
    const c = loadConfig({ ...base, SMTP_URL: '', MAIL_FROM: '  ' });
    expect(c.smtp).toBeNull();
  });

  it('SMTP_URL braucht MAIL_FROM und ein gültiges Schema', () => {
    expect(() => loadConfig({ ...base, SMTP_URL: 'smtps://u:p@mail.example.org:465' })).toThrow(
      /MAIL_FROM/,
    );
    expect(() => loadConfig({ ...base, SMTP_URL: 'http://mail', MAIL_FROM: 'a@b.de' })).toThrow(
      /smtp/,
    );
    const c = loadConfig({
      ...base,
      SMTP_URL: 'smtps://u:p@mail.example.org:465',
      MAIL_FROM: 'ds@example.org',
    });
    expect(c.smtp).toMatchObject({ from: 'ds@example.org', requireTls: true });
  });

  it('meldet ungültige Werte gesammelt', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc', SIGNUP_MODE: 'quatsch' })).toThrow(ConfigError);
  });

  it('prüft CORS_APP_ORIGINS', () => {
    expect(() => loadConfig({ ...base, CORS_APP_ORIGINS: 'kein-origin' })).toThrow(
      /CORS_APP_ORIGINS/,
    );
    expect(
      loadConfig({ ...base, CORS_APP_ORIGINS: 'https://localhost, capacitor://localhost' })
        .corsAppOrigins,
    ).toEqual(['https://localhost', 'capacitor://localhost']);
  });
});

describe('parseTrustProxy', () => {
  it('none oder leer deaktiviert Proxy-Vertrauen', () => {
    expect(parseTrustProxy('none')).toBeNull();
    expect(parseTrustProxy('')).toBeNull();
  });

  it('versteht Schlüsselwörter, IPs und CIDR', () => {
    const list = parseTrustProxy('loopback,private,203.0.113.0/24,2001:db8::1');
    expect(list?.check('127.0.0.1')).toBe(true);
    expect(list?.check('10.1.2.3')).toBe(true);
    expect(list?.check('172.20.0.5')).toBe(true);
    expect(list?.check('203.0.113.77')).toBe(true);
    expect(list?.check('2001:db8::1', 'ipv6')).toBe(true);
    expect(list?.check('8.8.8.8')).toBe(false);
  });

  it('lehnt Unsinn ab', () => {
    expect(() => parseTrustProxy('hallo')).toThrow(ConfigError);
    expect(() => parseTrustProxy('10.0.0.0/99')).toThrow(ConfigError);
  });
});
