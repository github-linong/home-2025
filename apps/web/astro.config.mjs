import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from "@astrojs/tailwind";
import { lilnongSitemap } from './src/integrations/lilnong-sitemap.mjs';
import { pagefindIntegration } from './src/integrations/pagefind.mjs';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://www.lilnong.top',
  integrations: [mdx(), tailwind(), lilnongSitemap(), pagefindIntegration()],
});