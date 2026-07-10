export const SITE_TITLE = 'lilnong.top - 李侬的个人站';
export const SITE_DESCRIPTION = '李侬的个人站 - 技术博客与思考';
export const SITE_AUTHOR = '李侬';
export const SITE_TAGLINE = '前端开发 · AI 实践 · 技术探索';
export const SITE_SUBTITLE = '用代码和 AI 构建有趣的东西';
export const BAIDU_HM_ID = '0b53b11d3930be87062f66b4b8ce2822';
export const GA_MEASUREMENT_ID = 'G-SZZNDW21W6';
export const GENERATE_SLUG_FROM_TITLE = false;
export const TRANSITION_API = true;

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
