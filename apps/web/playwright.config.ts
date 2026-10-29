import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 4173;
// Datenverzeichnis des Testservers; Worker erben es, Tests öffnen die Datenbank direkt (Abrechnungswochen vorbereiten)
process.env.DS_E2E_DATA ??= join(tmpdir(), `ds-e2e-${Date.now()}`);
export const DATA_DIR = process.env.DS_E2E_DATA;
export const BASE = `http://127.0.0.1:${PORT}`;
// Native-Build (Android-App) im Browser: eigener Ursprung, spricht per CORS mit der API
const APP_PORT = 4174;
export const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  reporter: [['list']],
  outputDir: 'e2e/.results',
  use: {
    baseURL: BASE,
    // Die Oberfläche folgt der Browsersprache; die meisten Tests prüfen den deutschen Text
    locale: 'de-DE',
    permissions: ['camera'],
    launchOptions: {
      // Fake-Kamera mit Testbild statt echter Hardware
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobil',
      testIgnore: /native\.spec/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'desktop',
      testIgnore: /native\.spec/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'app',
      testMatch: /native\.spec/,
      use: {
        baseURL: APP_BASE,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  // Baut die Web-App und startet die API, die sie ausliefert (same-origin wie im Betrieb)
  webServer: [
    {
      // Baut Web- und Native-Variante nacheinander (sie teilen sich .svelte-kit) und startet die API
      command: 'pnpm build && pnpm build:native:test && tsx ../api/src/server.ts',
      url: `${BASE}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(PORT),
        PUBLIC_URL: BASE,
        ALLOW_INSECURE_HTTP: 'true',
        CORS_APP_ORIGINS: APP_BASE,
        DATA_DIR,
        WEB_DIR: './build',
        SIGNUP_MODE: 'token',
        SETUP_TOKEN: 'e2e-setup-token-0123456789abcdef',
        ARGON2_MEMORY_KIB: '8192',
        ARGON2_TIME_COST: '1',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `node e2e/static-server.mjs build-native ${APP_PORT}`,
      url: `${APP_BASE}/__health`,
      reuseExistingServer: false,
    },
  ],
});
