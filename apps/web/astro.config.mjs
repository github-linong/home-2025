import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from "@astrojs/tailwind";
import { lilnongSitemap } from './src/integrations/lilnong-sitemap.mjs';
import { pagefindIntegration } from './src/integrations/pagefind.mjs';
import { createRequire } from 'node:module';

// Respect an outbound HTTPS proxy when one is configured (corporate/CI/sandbox),
// but stay out of the way on a normal dev machine where HTTPS_PROXY is unset —
// there it connects directly to the target. The proxy package is only required
// lazily, so machines without it (and without HTTPS_PROXY) never touch it.
const require = createRequire(import.meta.url);
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const proxyAgent = httpsProxy
  ? new (require('https-proxy-agent').HttpsProxyAgent)(httpsProxy)
  : undefined;

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
        ignored: ['**/public/demos/project/**', '**/public/demos/pdf/**', '**/public/demos/pinpin/**'],
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
        '/api/fequiz': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
        },
        // Game & chat (poker/wander/chat) + AI chat demo.
        // Default: proxy straight to the PRODUCTION server so local dev only
        // needs `astro dev` running — no local poker/wander/chat/api2 needed.
        // Set LOCAL_BACKEND=1 to proxy back to the local services instead
        // (poker :3003, wander :3004, chat :3005, api2 :3002).
        ...(process.env.LOCAL_BACKEND === '1'
          ? {
              '/api/demo': { target: 'http://127.0.0.1:3002', changeOrigin: true, ws: true },
              '/api/poker': { target: 'http://127.0.0.1:3003', changeOrigin: true },
              '/ws/poker': { target: 'ws://127.0.0.1:3003', ws: true, changeOrigin: true },
              '/ws/wander': { target: 'ws://127.0.0.1:3004', ws: true, changeOrigin: true },
              '/ws/chat': { target: 'ws://127.0.0.1:3005', ws: true, changeOrigin: true },
              '/ws/jianghu': { target: 'ws://127.0.0.1:3011', ws: true, changeOrigin: true },
              '/ws/dungeon': { target: 'ws://127.0.0.1:3010', ws: true, changeOrigin: true },
            }
          : {
              '/api/demo': { target: 'https://www.lilnong.top', changeOrigin: true, ws: true, agent: proxyAgent },
              '/api/poker': { target: 'https://www.lilnong.top', changeOrigin: true, agent: proxyAgent },
              '/ws/poker': { target: 'https://www.lilnong.top', ws: true, changeOrigin: true, agent: proxyAgent },
              '/ws/wander': { target: 'https://www.lilnong.top', ws: true, changeOrigin: true, agent: proxyAgent },
              '/ws/chat': { target: 'https://www.lilnong.top', ws: true, changeOrigin: true, agent: proxyAgent },
              '/ws/jianghu': { target: 'https://www.lilnong.top', ws: true, changeOrigin: true, agent: proxyAgent },
              '/ws/dungeon': { target: 'https://www.lilnong.top', ws: true, changeOrigin: true, agent: proxyAgent },
            }),
        // Legacy API (api)
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  },
});