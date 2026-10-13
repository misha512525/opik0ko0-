import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5180 },
  preview: { host: true, port: 4180 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('rapier')) return 'rapier';
          return undefined;
        },
      },
    },
  },
});
