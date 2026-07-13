# Lilnong legacy API (home-2023 path-compatible Express service)

Replaces the previous Hono stub. External routes and response shapes match
`github-linong/home-2023` (`lilnong/app.js` + `routes/*`).

## Run

```bash
cd apps/api
cp ../../.env.example ../../.env   # fill secrets
npm install
npm run dev    # http://127.0.0.1:3001
npm test
```

## Layout

- `src/app.js` — Express app wiring
- `src/routes/` — route modules (`upload`, `cors-demo`, `proxy`, `wechat`, `douyin`, `music`=/vapi, `legacy-api`=/api/*, …)
- `src/services/` — Baidu token, Mongo helper
- `vendor/decrypt/` — unlock-music decrypt used by `/vapi/tkmUrl2m4a`
- `assets/` — favicon, MP verify, xss.js, merge template, invitation client, default `fonts/font.ttf`
- `data/` — uploads / fontmin / logs (gitignored)

### Fonts (`/createfont`)

- Default source: `assets/fonts/font.ttf` (in git).
- Full legacy set (楷体 / 毛体 / …) lives on OSS **`private/fonts/`** (not public-read, not in git).
- Sync to this host: `OSS_*=... npm run sync:fonts:from-oss` (or set `FONT_DEST=/opt/lilnong-api/assets/fonts`).
- Optional query: `/createfont?txt=你好&font=kaiti` (basename under `assets/fonts/`).

## Key paths preserved

`/upload*`, `/proxy`, `/CORS/*`, `/corsutils/*`, `/vapi/*`, `/api3/*`, `/wx/*`,
`/invitation/*`, `/api/*` (POST), `/tencent_ai_api/*`, `/createfont`, `/post`,
`/falseReport`, `/logReport`, `/felog`, …
