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
- `assets/` — favicon, MP verify, xss.js, merge template, invitation client, font
- `data/` — uploads / fontmin / logs (gitignored)

## Key paths preserved

`/upload*`, `/proxy`, `/CORS/*`, `/corsutils/*`, `/vapi/*`, `/api3/*`, `/wx/*`,
`/invitation/*`, `/api/*` (POST), `/tencent_ai_api/*`, `/createfont`, `/post`,
`/falseReport`, `/logReport`, `/felog`, …
