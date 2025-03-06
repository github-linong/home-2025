import type { StorybookConfig } from '@storybook/nextjs'
import type { UserConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  async viteFinal(config: UserConfig) {
    return {
      ...config,
      server: {
        ...config.server,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
    }
  },
}

export default config 