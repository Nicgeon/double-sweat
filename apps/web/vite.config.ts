import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:3000';
// Build für die Android-App: VITE_TARGET=native (eigenes Ausgabeverzeichnis, das Capacitor einbettet)
const native = process.env.VITE_TARGET === 'native';
// Versionsnummer der Oberfläche (scripts/bump-version.mjs hält sie mit den anderen Paketen gleich)
const version = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    sveltekit({
      // SPA: eine einzige index.html als Fallback, die API liefert sie aus (same-origin, kein CORS)
      adapter: native
        ? adapter({
            pages: 'build-native',
            assets: 'build-native',
            fallback: 'index.html',
            strict: false,
          })
        : adapter({ fallback: 'index.html', strict: false }),
    }),
  ],
  server: {
    // Das Designsystem liegt außerhalb dieses Pakets (design/)
    fs: { allow: ['../..'] },
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
