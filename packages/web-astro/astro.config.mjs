import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
    integrations: [
        react(),
        tailwind({
            applyBaseStyles: false,
        }),
    ],
    output: 'static',
    site: 'https://lnmacmini.github.io',
    compressHTML: true,
    build: {
        inlineStylesheets: 'auto',
    },
}); 