# Personal Site (lilnong.top)

Monorepo migrated from [lilnong.top](https://www.lilnong.top): **Astrofy** static frontend + **Hono** API (auth reserved) + **MySQL**.

## Structure

```
personal-site/
├── apps/
│   ├── web/          # Astrofy — blog, demos, about (static)
│   └── api/          # Hono — OAuth + invite stubs, future features
├── deploy/           # docker-compose, nginx, mysql init
├── demos/            # (optional) source for larger web demos
└── scripts/          # deploy & invite helpers
```

## Local development

Requires **Node.js 22+** (`nvm use 22`).

```bash
# Terminal 1 — static site
npm run dev:web
# → http://localhost:4321

# Terminal 2 — API
npm install --prefix apps/api
npm run dev:api
# → http://localhost:3001/api/health
```

## Build

```bash
npm run build:web    # output: apps/web/dist/
npm run build:api    # output: apps/api/dist/
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

## Auth (reserved)

- Public pages need **no login**.
- API stubs: `/api/auth/*`, `/login`, `/invite/:token`
- Set `AUTH_ENABLED=true` and OAuth env vars when ready.
- Schema: `deploy/mysql/init.sql`

## Production (Docker)

```bash
cp .env.example .env
npm run build:web
cd deploy && docker compose up -d
# → http://localhost:8080 (nginx serves static + proxies API)
```

Point your domain to the server, terminate TLS at nginx/Caddy on the host.

## Based on

- [Astrofy](https://github.com/manuelernestog/astrofy) (MIT) — customized for demos, removed store/CV from nav.
