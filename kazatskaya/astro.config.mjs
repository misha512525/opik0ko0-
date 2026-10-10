// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// TODO: подтвердить боевой домен — от него зависят sitemap, canonical и абсолютные og:image.
const SITE = process.env.SITE_URL || 'https://kazatskaya.netlify.app';

export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  // CSS инлайнится в HTML: без render-blocking запросов (≈17 КБ gzip)
  build: { inlineStylesheets: 'always', format: 'directory' },
  image: { responsiveStyles: false },
  vite: {
    plugins: [tailwindcss()],
    build: { target: 'es2020', assetsInlineLimit: 0 },
  },
  devToolbar: { enabled: false },
  server: { host: true, port: 4321 },
});
