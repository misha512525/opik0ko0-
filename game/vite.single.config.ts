import { defineConfig } from 'vite';

// Сборка в один бандл без разбиения на чанки — для scripts/single-html.mjs.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 10_000,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
