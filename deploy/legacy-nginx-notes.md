# Legacy nginx notes (home-2023)

> **Archive / ops reference only.** Do not paste these files into production as-is.
> Current site uses [`nginx.conf`](./nginx.conf) (static Astro + Express API + OSS `/static/`).

Source tree in the old repo: `nginx/` + `123.56.16.33/lilnong/nginx.conf`.

## What the old stack looked like

| Port band (README) | Role |
|---|---|
| 8000–8999 | Intranet static |
| 9000–9999 | Dynamic (hexo / next / APIs) |
| 80/443 | Public vhosts (宝塔 / Certbot) |

Process managers: **pm2** (Node apps), **宝塔** (edge nginx).

## Subdomains that used to exist

| server_name | Purpose | Root / upstream |
|---|---|---|
| `www.lilnong.top` | Main site | `/root/lilnong/` (`/static` → `lilnong/static`) |
| `music-api.lilnong.top` | NeteaseCloudMusicApi | `proxy_pass http://localhost:9101` |
| `music-play.lilnong.top` | vue-music-webapp | `static-project/vue-music-webapp` |
| `ws.lilnong.top` / websocket | WS demos | local WS process |
| `cors-*.lilnong.top` | CORS / live proxy experiments | static + `Access-Control-*` headers |
| `a2hs` / `js13kpwa` / `demo-progressive-web-app-master` | PWA demos | `static-project/*` |
| `jgq.*` / `jfsrc.*` / `dx.*` / `cocos.*` | Client / side projects | separate roots — **not** personal-site |

## Useful recipes worth remembering

### 1. JSON access logs

Old `nginx.conf` used custom `mainjson` / `logstash_json` formats (host, URI, referer, UA, `x_forwarded_for`, timing). Handy if you re-enable structured access logs later.

### 2. Third-party reverse proxies on the main host

Examples from historical www config (copyright / ToS risk — usually **do not** re-enable):

- `/proxy-iciba/` → open.iciba.com
- `/lrc-proxy` → music CDN lyric hosts
- `/urlTrans/` → local `9101` helper

Prefer first-party APIs or drop these.

### 3. Static with forced download

`/static-autodown` added `Content-Disposition: attachment` for `mp3|mp4`. New stack serves media from OSS; attachment behavior can be done with OSS metadata or a dedicated location if needed.

### 4. CORS reflect

Legacy CORS test hosts echoed `$http_origin` and handled OPTIONS. New Express routes under `/CORS/*` and `/corsutils/*` cover the demo cases; multi-subdomain CORS hosts are retired.

### 5. Music stack

```
music-api.lilnong.top  →  127.0.0.1:9101  (NeteaseCloudMusicApi)
music-play.lilnong.top →  vue-music-webapp static
```

Env still documents `NETEASE_API_BASE=http://127.0.0.1:9101`. Re-deploy that API separately if music demos are revived; it is **not** bundled in personal-site.

## Mapping to current nginx

| Legacy | Current |
|---|---|
| `/static/html/*.html` on disk | `301` → `/demos/html/$1` |
| `/static/project/` (main site) | rewrite → `/demos/project/` when present in Astro build |
| `/theme/*.html` | `301` → `/demos/theme/$1` |
| Rest of `/static/` | proxy → OSS bucket `hone-2023` |
| `/static/uploads/` | **404** (private uploads live under OSS `private/uploads`) |
| Upload / AI / wx / vapi / … | proxy → Express `:3001` |
| Demo subdomains (a2hs / PWA / music-play / cocos / …) | [`legacy-subdomains.conf`](./legacy-subdomains.conf) → OSS `static/project/*` + cert `legacy-demos.lilnong.top` |

## Restored personal demo subdomains

Config: `deploy/legacy-subdomains.conf` (live: `/etc/nginx/conf.d/legacy-subdomains.conf`).

| Host | OSS prefix |
|---|---|
| `a2hs.lilnong.top` | `static/project/a2hs` |
| `js13kpwa.lilnong.top` | `static/project/js13kpwa` |
| `demo-progressive-web-app-master.lilnong.top` | `static/project/demo-progressive-web-app-master` |
| `music-play.lilnong.top` | `static/project/vue-music-webapp` |
| `web-mobile-20200711` / `cocos-20200711` | `static/project/web-mobile` |
| `cocos2d-20200711` | `static/project/web-mobile-2/web-mobile` |
| `hytstart.lilnong.top` | `…/hytStart…` (default `/game/21/`) |
| `sf-sellgaode` / `-2` | `sellgaode` / `sellgaode2` |
| `jinguoqiangtool.lilnong.top` | `jinguoqiangTool` |
| `nginx-q-20200713` | `20200713-zhangyue` |
| `dx.lilnong.top` | `dx` |
| `cors-1010000020275154` | whole `static/` + CORS `*` |
| `home` / `home-2023` / `cors-www` / `http2-www` | `301` → `www.lilnong.top` |

**Not restored yet** (need process / customer assets): `music-api`, `ws` / `websocket`, `django`, `jfsrc*`, `jgq-server`, `feedsbd`.

Cert renew: `certbot renew` (cert-name `legacy-demos.lilnong.top`).

## Files kept for archaeology

Sanitized copies live under [`legacy-nginx/`](./legacy-nginx/) (comments + structure only; **no** certificate paths with live secrets, no private keys). Prefer reading this note first.

## Do not migrate

- `letsencrypt/` private keys / ACME account keys
- Hardcoded upstream credentials inside old site apps
- Customer vhosts (`jfsrc`, `jgq`, `dx`, …)
