import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The built bundle is embedded into the conduit binary (go:embed) and served at
// `/`, so assets must load from a relative base and the build must be a static
// SPA (no SSR).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
  },
});
