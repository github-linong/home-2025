module.exports = {
    apps: [
        {
            name: 'home-2025-dev',
            script: 'node_modules/.bin/next',
            args: 'dev',
            cwd: './packages/web',
            watch: ['src'],
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            pre_setup: 'npm install -g pnpm && pnpm install'
        },
        {
            name: 'home-2025-prod',
            script: 'node_modules/.bin/next',
            args: 'start',
            cwd: './packages/web',
            instances: 'max',
            exec_mode: 'cluster',
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            pre_setup: 'npm install -g pnpm && pnpm install && pnpm build'
        },
    ],
}; 