/**
 * Profile data for linong — aggregated from lilnong.top, SegmentFault articles & answers.
 */
export const profile = {
  name: "linong",
  username: "linong",
  displayName: "linong",
  tagline: "前端开发 · AI 实践 · 技术探索",
  subtitle: "用代码和 AI 构建有趣的东西",
  motto: "Read-Search-Ask",
  bio: [
    "2016 年起在 SegmentFault 写文答疑，长期关注 JavaScript / Vue / 工程化与线上问题排查。",
    "近年更多探索 AI 辅助开发、个人 Demo 从想法到上线，并把思否上的文章与回答逐步迁移到本站。",
    "相信先把问题搞清楚（Read），再动手验证（Search），最后给出可复用的答案（Ask）。",
  ],
  location: {
    city: "北京",
    joinedAt: "2016-07-12",
  },
  contact: {
    email: "lilnong1@126.com",
    wechat: "LN4518",
    wechatNote: "交个朋友、付费问答、源码",
    wechatPublicAccount: "前端linong",
    wechatQrCode: "/wx-qrcode.jpg",
  },
  legal: {
    icp: "京ICP备18045145号",
    icpUrl: "https://beian.miit.gov.cn/",
  },
  site: "https://www.lilnong.top",
  avatar: {
    local: "/profile.webp",
    sourceUrl:
      "https://avatar-static.segmentfault.com/109/281/1092810414-622c35010f4cd_huge256",
  },
  segmentfault: {
    profileUrl: "https://segmentfault.com/u/linong",
    articlesUrl: "https://segmentfault.com/u/linong/articles",
    answersUrl: "https://segmentfault.com/u/linong/answers",
    answersByVotesUrl: "https://segmentfault.com/u/linong/answers?sort=votes",
    answersByNewestUrl: "https://segmentfault.com/u/linong/answers?sort=newest",
    blogUrl: "https://segmentfault.com/blog/javascript-lNong",
    stats: {
      articles: 164,
      answers: 3624,
      questions: 192,
      upvotes: 2919,
      followers: 9742,
      following: 175,
      views: "704.5k",
    },
    badges: [
      "经典问题",
      "火爆问题",
      "受欢迎问题",
      "Top Writer",
      "长文达人",
      "评审",
    ],
    tags: ["javascript-lNong", "Javascript-luoluo", "css", "webpack"],
  },
  expertise: [
    "JavaScript / TypeScript / Vue",
    "浏览器原理、DOM、事件与性能",
    "Node.js 脚本与工程化（Webpack 等）",
    "跨域、Cookie、HTTP 与网络调试",
    "组件库实践（Element UI / Ant Design Vue）",
    "AI 辅助开发与 Cursor 实践",
  ],
  themes: [
    "前端工程化与 Bug 排查（「前端 BUG 录」系列）",
    "AI 辅助开发与 Cursor / Demo 全流程实践",
    "面试题拆解与职业发展复盘",
    "组件库 / AST / SPA 升级与工程实践",
    "Web 性能优化与 Lighthouse 专项",
    "场景实战：上传、预览、拖拽、移动端适配",
  ],
  series: [
    { name: "前端 BUG 录", description: "线上问题排查、复现与复盘" },
    { name: "前端面试", description: "高频面试题与解题思路" },
    { name: "前端培训", description: "初中级阶段系统笔记（JS → Vue → Node）" },
    { name: "前端答疑", description: "Chrome DevTools、Nginx、Vue 等实战答疑" },
    { name: "Web 页面优化专项", description: "Lighthouse 与加载体积优化" },
    { name: "面试官系列", description: "事件、数组、CSS 等基础考点" },
  ],
  featuredAnswers: [
    {
      title: "js 对象数组排序+去重问题",
      votes: 11,
      url: "https://segmentfault.com/q/1010000040137996/a-1020000040138625",
    },
    {
      title: "用js完成[12, 3, 24, 1, 932, 6423] 按照首位排序",
      votes: 7,
      accepted: true,
      url: "https://segmentfault.com/q/1010000040479765/a-1020000040479808",
    },
    {
      title: "怎么实现文字在一行内显示，超过字数用...代替？",
      votes: 6,
      url: "https://segmentfault.com/q/1010000009355954/a-1020000009355985",
    },
    {
      title: "vue回车聚焦下一个input，动态绑定ref出现，refs拿到为undefined",
      votes: 5,
      url: "https://segmentfault.com/q/1010000038404066/a-1020000038404135",
    },
    {
      title: "修改浮动元素宽高之后是否会触发重排？",
      votes: 3,
      accepted: true,
      url: "https://segmentfault.com/q/1010000043366886/a-1020000043466296",
    },
  ],
  links: {
    site: "https://www.lilnong.top",
    segmentfault: "https://segmentfault.com/u/linong",
    github: "https://github.com/hkxiaoyao/edict",
  },
} as const;
