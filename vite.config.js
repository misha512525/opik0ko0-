import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2020',
    cssMinify: true,
    assetsInlineLimit: 0,
  },
});
