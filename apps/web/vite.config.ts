import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [
    sveltekit({
      // SPA: eine einzige index.html als Fallback, die API liefert sie aus (same-origin, kein CORS)
      adapter: adapter({ fallback: 'index.html', strict: false }),
    }),
  ],
  server: {
    // Das Designsystem liegt außerhalb dieses Pakets (design/)
    fs: { allow: ['../..'] },
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
