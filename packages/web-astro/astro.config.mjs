import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
    integrations: [
        react(),
        tailwind({
            applyBaseStyles: false,
        }),
    ],
    output: 'static',
    adapter: node({
        mode: 'standalone',
    }),
    site: 'https://home-2025.lilnong.top',
    base: './',
    compressHTML: true,
    build: {
        inlineStylesheets: 'auto',
    },
}); 