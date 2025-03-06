/** @type {import('next').NextConfig} */
import path from 'path'
import { fileURLToPath } from 'url'
import CopyWebpackPlugin from 'copy-webpack-plugin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const cesiumSource = 'node_modules/@cesium/engine/Source'
const cesiumWorkers = '../Build/Workers'

const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve.fallback,
          fs: false,
          Buffer: false,
          http: false,
          https: false,
          zlib: false,
          url: false,
        },
        alias: {
          ...config.resolve.alias,
          '@cesium/engine': path.resolve(__dirname, 'node_modules/@cesium/engine'),
        },
      }
      
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.join(
                path.dirname(require.resolve('@cesium/engine')),
                'Build/Cesium',
              ),
              to: 'static/cesium',
              filter: (resourcePath) => {
                return !resourcePath.includes('node_modules')
              },
              info: { minimized: true }
            },
          ],
        }),
      )
    }

    return config
  },
  transpilePackages: ['@cesium/engine'],
} 