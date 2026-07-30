# 收录急救包 · Google Search Console + 百度搜索资源平台

> 你已经完成的部分（代码侧）：sitemap 已在构建时生成（`sitemap-0.xml` + `sitemap-index.xml`），
> `robots.txt` 已指向它；每页都有 `<meta name="description">` 和 JSON-LD；本周还补了
> 面包屑、Organization 发布者、博客「相关文章」内链。
>
> 真正导致 `site:lilnong.top` 几乎无结果的原因不是"没写 meta/结构化数据"，
> 而是**站点从未在搜索引擎后台验证过**，因此无法提交 sitemap、无法主动请求收录。
> 本文件是你需要手动完成的账号侧操作。

---

## 0. 部署前提（一次性）

构建时 `astro.config.mjs` 用 `process.env.SITE_URL ?? 'https://www.lilnong.top'`。
部署请确保注入 `SITE_URL=https://www.lilnong.top`，否则 canonical / sitemap 域名会错。

部署后，先确认这几样已就位（直接 curl 看响应头/正文）：

```bash
# 1) sitemap 可达
curl -s https://www.lilnong.top/sitemap-index.xml | head
# 2) robots.txt 引用了 sitemap
curl -s https://www.lilnong.top/robots.txt
# 3) 任意文章源码里应有 description / json-ld / canonical
curl -s https://www.lilnong.top/blog/简单的前后端交互流程ajax/ | grep -o '<meta name="description"[^>]*>'
```

如果你**还没运行 SF 文章 slug 迁移**（`scripts/blog-slug-migrate.mjs --apply`），
那一长串文章仍是 `/blog/sf-<id>/` 这种无语义 URL——建议先读完第 4 节再决定是否迁移。

---

## 1. Google Search Console（GSC）

1. 打开 <https://search.google.com/search-console> ，用你的 Google 账号登录。
2. **添加资源** → 选「网址前缀」→ 填 `https://www.lilnong.top/` （与 canonical 一致，用 www）。
3. **验证方式** 选「HTML 标记」：
   - 复制 `<meta name="google-site-verification" content="XXXX" />` 里的 `XXXX`。
   - 粘贴到 `apps/web/src/config.ts` 的 `GOOGLE_SITE_VERIFICATION = 'XXXX';`
   - 重新构建并部署：`npm run build:web` → 部署。
   - （备选）把 Google 给的 `googleXXXX.html` 放到 `apps/web/public/` 下，同样可验证。
4. 验证通过后，**提交 sitemap**：左侧「Sitemaps」→ 填 `sitemap-index.xml` → 提交。
5. **主动请求收录**：左侧「URL 检查」→ 逐个粘贴重要页 URL（首页、/blog/、/demos/、
   /about/、以及几篇你想主推的文章）→ 「请求编入索引」。新文章发布后也用这招。
6. 在「覆盖范围」里观察已编入索引的页面数，通常 1–4 周内爬取量明显上升。

---

## 2. 百度搜索资源平台

1. 打开 <https://ziyuan.baidu.com/> ，用百度账号登录。
2. **添加网站** → 填 `https://www.lilnong.top` → 验证：
   - 选「HTML 标签验证」→ 复制 `content` 值 → 填到 `config.ts` 的
     `BAIDU_SITE_VERIFICATION = '...';` → 重新构建部署。
   - （备选）下载 `baidu_verify_XXXX.html` 放到 `apps/web/public/`。
3. **提交 sitemap**：「站点管理 → 数据管理 → sitemap」→ 添加
   `https://www.lilnong.top/sitemap-index.xml` 。
4. **主动推送（普通收录 API）**——这是百度最快的收录通道：
   ```bash
   # 先看会推哪些 URL（不真正调用）
   BAIDU_PUSH_TOKEN=xxx npm run baidu:push -- --dry-run --recent 50
   # 确认无误后真正推送（优先原创文章，其次最新）
   BAIDU_PUSH_TOKEN=xxx npm run baidu:push -- --recent 50
   ```
   `BAIDU_PUSH_TOKEN` 在「普通收录 → API 提交」里获取。每次发新文章跑一次
   `npm run baidu:push -- --recent 10` 即可。
5. 百度对新站/改版有沙盒期，主动推送 + sitemap 双管齐下，耐心 2–6 周。

---

## 3. 规范域名：apex → www 的 301（重要）

全站 canonical 都指向 `www.lilnong.top`。如果你搜索的是 `site:lilnong.top`（非 www），
收录/展现会偏少。确保 `lilnong.top`（裸域）** 301 跳转到 `www.lilnong.top`：

```bash
# 该脚本登录生产 nginx 主机，给 lilnong.top-https.conf 打补丁并 reload
./scripts/apply-www-canonical-redirect.sh
# 验证
curl -sI https://lilnong.top/ | grep -i location
```

若你还没跑过、或不确定，先跑上面验证命令看 `Location: https://www.lilnong.top/` 是否在。

---

## 4. （可选但推荐）SF 迁移文章语义化 URL

现状：**274 / 299** 篇文章仍是 `/blog/sf-<segmentfault数字id>/`，对关键词匹配不友好。
代码已支持：在文章 frontmatter 写 `slug:` 即可改 URL（Astro 保留字段，无需改名文件）。

工具 `scripts/blog-slug-migrate.mjs` 已就绪：

```bash
# 1) 先 dry-run 看映射（已验证：274 篇，无冲突，生成中文语义 slug）
node scripts/blog-slug-migrate.mjs

# 2) 确认后真正写入 frontmatter，并生成 301 重定向映射
node scripts/blog-slug-migrate.mjs --apply
#   → 写入每篇 sf 文章的 slug: 字段
#   → 生成 deploy/nginx/blog-sf-redirects.conf（旧 URL → 新 URL 的 301）
#   → 生成 scripts/data/blog-slug-map.json（备查）
```

**应用后务必**：重新构建部署，并把 `deploy/nginx/blog-sf-redirects.conf` 传到服务器、
在 `lilnong.top-https.conf` 的 server 块里 `include` 它，然后
`nginx -t && systemctl reload nginx`。否则旧 URL（书签、已收录页）会 404。

> 中文 slug（如 `/blog/简单的前后端交互流程ajax/`）对百度/Google 都友好，
> 关键词直接进 URL，比 `sf-1190000007281165` 好得多。介意中文 URL 的可以改脚本
> `slugifyTitle` 为拼音方案，但一般不必要。

---

## 5. 上线后自检清单

- [ ] GSC 已验证 `https://www.lilnong.top`，sitemap 已提交，至少首页/博客列表请求了收录
- [ ] 百度已验证，sitemap 已提交，跑过一次 `baidu:push --recent 50`
- [ ] apex→www 301 已生效
- [ ] 源码里能看到 `<meta name="google-site-verification">` 和 `baidu-site-verification`
- [ ] 源码里 JSON-LD 含 `BreadcrumbList`、`Organization`、文章 `publisher`
- [ ] 博客文章底部出现「相关文章」内链
- [ ] 用 [Rich Results Test](https://search.google.com/test/rich-results) 抽查一篇博客，无报错
- [ ] 2–6 周后回 GSC/百度看收录数与展现量变化

---

## 6. 关于「思否内容重复」的说明

274 篇来自 SegmentFault 的文章在 frontmatter 里有 `sourceUrl`，但 **canonical 是自引的**
（`buildCanonicalUrl` 指向本站），JSON-LD 也标了 `isBasedOn` 指向原文。
只要站点验证、sitemap 提交、且本站内容完整（你还额外做了 AI 优化版），
Google 通常会以本站为权威版本。若仍被思否压制，优先级是：先做完上面的收录动作，
再考虑对纯搬运、无增量价值的旧文做 `noindex`（不要批量，逐篇判断）。
