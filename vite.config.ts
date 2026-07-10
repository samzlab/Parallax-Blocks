import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    cssMinify: true,
    minify: 'esbuild',
    assetsInlineLimit: 100_000_000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
