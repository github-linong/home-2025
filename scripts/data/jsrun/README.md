# JSRUN archive (local)

Downloaded by `node scripts/download-jsrun.mjs`, imported by `node scripts/migrate-jsrun-demos.mjs`.

## Strict serial + polite delays

- **One snippet at a time** (no parallelism; `--concurrency` is ignored)
- After **each** HTTP request: wait `--delay` (default **1500ms**, floor 800ms)
- After **each finished** snippet: wait `--gap` (default **2500ms**)
- ≈ **7s+ per snippet** by default (`3 × delay + gap`)
- Resume skips existing `snippets/<slug>/meta.json`

## Import into site

```bash
npm run migrate:jsrun
# or
node scripts/migrate-jsrun-demos.mjs --force
```

Writes:

- `apps/web/public/demos/jsrun/*.html` — runnable pages
- `apps/web/src/content/demos/jsrun-*.md` — Astro entries (badge `JSRUN`, tags `jsrun` + `legacy`)
- `apps/web/src/data/jsrun-demos.json` — manifest

Visible under **Demo 归档** / 搜索（不会冲进首页精选列表）。

## Prepare catalog

Save your JSRUN list API JSON as e.g. `catalog.json` in this folder (gitignored):

```bash
node scripts/download-jsrun.mjs \
  --catalog scripts/data/jsrun/catalog.json \
  --limit 5
```
