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
    optimizeDeps: {
      // Keep talkinghead unbundled so its `new URL('./playback-worklet.js',
      // import.meta.url)` audio worklet resolves in dev.
      exclude: ['@met4citizen/talkinghead'],
    },
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
        // Better Auth (api2) — more specific paths first
        '/api/auth': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
        },
        '/api/me': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
        },
        '/api/learn': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
        },
        '/api/demo': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
          ws: true,
        },
        '/ws/poker': {
          target: 'ws://127.0.0.1:3003',
          ws: true,
          changeOrigin: true,
        },
        '/ws/wander': {
          target: 'ws://127.0.0.1:3004',
          ws: true,
          changeOrigin: true,
        },
        '/ws/chat': {
          target: 'ws://127.0.0.1:3005',
          ws: true,
          changeOrigin: true,
        },
        '/api/poker': {
          target: 'http://127.0.0.1:3003',
          changeOrigin: true,
        },
        // Legacy API (api)
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  },
});