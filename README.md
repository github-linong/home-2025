# Personal Site (lilnong.top)

Monorepo migrated from [lilnong.top](https://www.lilnong.top): **Astrofy** static frontend + **Express** legacy API (home-2023 compatible) + optional **MySQL**.

## Structure

```
personal-site/
├── apps/
│   ├── web/          # Astrofy — blog, demos, about (static)
│   └── api/          # Express — home-2023 path-compatible API
├── deploy/           # docker-compose, nginx, mysql init
└── scripts/          # deploy & migrate helpers
```

## Local development

Requires **Node.js 22+** (`nvm use 22`).

```bash
# Terminal 1 — static site
npm run dev:web
# → http://localhost:4321

# Terminal 2 — API
cp .env.example .env   # fill Baidu / WeChat / Face++ / Tencent / Mongo as needed
npm install --prefix apps/api
npm run dev:api
# → http://localhost:3001/api/health
```

For local auth UI against the API, proxy `/api` in Astro (or open site via nginx on 8080). Dev tip: set `AUTH_ENABLED=true`, `AUTH_SECRET`, and `AUTH_ADMIN_PASSWORD` then visit `/login/`.

Legacy demo endpoints (same paths as old Node app): `/upload*`, `/proxy`, `/CORS/*`, `/vapi/*`, `/api3/*`, `/wx/*`, …

## Build

```bash
npm run build:web    # output: apps/web/dist/
# API is plain Node (no build step): npm start --prefix apps/api
npm test --prefix apps/api
```

## Content (Git)

| Path | Purpose |
|------|---------|
| `apps/web/src/content/blog/*.md` | Articles (public) |
| `apps/web/src/content/demos/*.md` | Demo registry + docs |
| `apps/web/public/demos/` | Static web demo assets |

Edit `apps/web/src/config.ts` for site title, author, tagline.

## Demos

Add a markdown file under `content/demos/` with frontmatter:

- `type`: `web` | `desktop` | `cli` | `external` | `embed`
- `demoUrl`: path or URL for playable web demos
- `repoUrl`: source repository

Web demos: put static build under `public/demos/your-demo/`.

## Production (Docker)

```bash
cp .env.example .env
npm run build:web
cd deploy && docker compose up -d
# → http://localhost:8080 (nginx serves static + proxies legacy API paths)
```

Point your domain to the server, terminate TLS at nginx/Caddy on the host.

See `apps/api/README.md` for API layout and env vars.

## Based on

- [Astrofy](https://github.com/manuelernestog/astrofy) (MIT) — customized for demos, removed store/CV from nav.
- Legacy API behavior from [home-2023](https://github.com/github-linong/home-2023).
