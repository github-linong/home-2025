export const SITE_TITLE = 'lilnong.top - linong 的个人站';
export const SITE_DESCRIPTION = 'linong 的个人站 - 技术博客与思考';
export const SITE_AUTHOR = 'linong';
export const SITE_TAGLINE = '前端开发 · AI 实践 · 技术探索';
export const SITE_SUBTITLE = '用代码和 AI 构建有趣的东西';
export const BAIDU_HM_ID = '0b53b11d3930be87062f66b4b8ce2822';
/**
 * Search-engine site-verification meta tags.
 * Fill AFTER verifying the property in each console (meta-tag method):
 *   - Google Search Console: https://search.google.com/search-console
 *   - Baidu 搜索资源平台: https://ziyuan.baidu.com/
 * Until these are set, sitemaps cannot be submitted and indexing requests
 * cannot be made — the single biggest cause of "site:lilnong.top" returning
 * almost nothing.
 * File verification alternative: drop the downloaded google***.html /
 * baidu_verify_*.html into apps/web/public/.
 */
export const GOOGLE_SITE_VERIFICATION = '';
export const BAIDU_SITE_VERIFICATION = '';
export const GA_MEASUREMENT_ID = 'G-SZZNDW21W6';
export const GENERATE_SLUG_FROM_TITLE = false;
export const TRANSITION_API = true;

/** Shared across www.lilnong.top and lilnong.top; omitted on localhost */
export const AUTH_COOKIE_DOMAIN = 'lilnong.top';

/** Giscus comments — fill repoId/categoryId from https://giscus.app after enabling GitHub Discussions */
export const GISCUS_CONFIG = {
  enabled: false,
  repo: 'github-linong/home-2025',
  repoId: '',
  category: 'General',
  categoryId: '',
  mapping: 'pathname',
  reactions: '1',
  theme: 'preferred_color_scheme',
} as const;

/** Newsletter — RSS is always available; set emailSignupUrl when using Buttondown etc. */
export const NEWSLETTER_CONFIG = {
  rssUrl: '/rss.xml',
  emailSignupUrl: '',
  description: '通过 RSS 阅读器订阅本站博客更新，新文章发布后会自动推送。',
} as const;

/** Blog posts with this tag are system announcements (public notices). */
export const PUBLIC_NOTICE_TAG = '用户公告';
