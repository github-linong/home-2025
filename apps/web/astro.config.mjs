import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from "@astrojs/tailwind";
import { lilnongSitemap } from './src/integrations/lilnong-sitemap.mjs';
import { pagefindIntegration } from './src/integrations/pagefind.mjs';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://www.lilnong.top',
  integrations: [mdx(), tailwind(), lilnongSitemap(), pagefindIntegration()],
  redirects: {
    '/blog/search': '/search/?type=blog',
    '/blog/search/': '/search/?type=blog',
    '/demos/search': '/search/?type=demo',
    '/demos/search/': '/search/?type=demo',
  },
  vite: {
    server: {
      // Whole-site demos are large static trees; watching them stalls the dev server.
      watch: {
        ignored: ['**/public/demos/project/**', '**/public/demos/pdf/**'],
      },
      proxy: {
        '/static': {
          target: 'https://hone-2023.oss-cn-beijing.aliyuncs.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  },
});