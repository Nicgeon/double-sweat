import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 4173;
// Datenverzeichnis des Testservers; Worker erben es, Tests öffnen die Datenbank direkt (Abrechnungswochen vorbereiten)
process.env.DS_E2E_DATA ??= join(tmpdir(), `ds-e2e-${Date.now()}`);
export const DATA_DIR = process.env.DS_E2E_DATA;
export const BASE = `http://127.0.0.1:${PORT}`;

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
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  // Baut die Web-App und startet die API, die sie ausliefert (same-origin wie im Betrieb)
  webServer: {
    command: 'pnpm build && tsx ../api/src/server.ts',
    url: `${BASE}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      PUBLIC_URL: BASE,
      ALLOW_INSECURE_HTTP: 'true',
      DATA_DIR,
      WEB_DIR: './build',
      SIGNUP_MODE: 'token',
      SETUP_TOKEN: 'e2e-setup-token-0123456789abcdef',
      ARGON2_MEMORY_KIB: '8192',
      ARGON2_TIME_COST: '1',
      LOG_LEVEL: 'warn',
    },
  },
});
