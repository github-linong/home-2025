// cocos/assets/Script/Core/Copy.ts
// 客户端 UI 文案集中管理（拼拼卡 · 鼓励语气规范）
//
// 规范（见 README「文案规范」）：
//   全程鼓励、正向；禁用「失败 / 你输了 / 闯关失败」等负面词。
//   未完成用「再试一次 / 差一点点 / 继续加油」；
//   通关用「完成啦 / 太棒了 / 拼好啦」；
//   收集用「集到新卡 / 又解锁一张」；抽奖用「试试手气 / 惊喜来袭」。
//
// 所有用户可见字符串统一从这里取，禁止在场景里硬编码文案。
export const Copy = {
  app: {
    name: '拼拼卡',
    slogan: '拼一拼，集满小确幸',
    loading: '正在为你准备拼图…',
    retryLater: '网络有点小脾气，稍后再试一次吧',
    weakNet: '网络不太稳，已为你缓存进度，安心拼',
  },

  privacy: {
    title: '欢迎来到拼拼卡',
    desc: '我们很在意你的隐私，需要你的同意，才能陪你一起开心拼图',
    agree: '同意并开始',
    deny: '再想想',
  },

  home: {
    title: '今天也要开开心心拼图呀',
    startLevel: '开始拼图',
    drawCard: '试试手气',
    dailyTask: '今日小目标',
    season: '本赛季进度',
    collection: '我的卡片册',
  },

  level: {
    start: '准备好就出发啦',
    hint: '看一眼参考图',
    hintUsed: '已经看过参考图啦',
    progress: (p: number) => `已经完成 ${Math.round(p * 100)}% 啦`,
    almostDone: '差一点点就拼好啦',
    paused: '休息一下，随时回来继续',
  },

  result: {
    // 按星级给不同鼓励，均不出现负面词
    clear3: '拼好啦！太棒了',
    clear2: '完成啦，继续加油',
    clear1: '拼好啦，下次会更快',
    star: (n: number) => `获得 ${n} 颗小星星`,
    newCard: '集到新卡！',
    retry: '再试一次',
    next: '下一张',
    backHome: '回主页',
  },

  gacha: {
    title: '试试手气',
    freeLeft: (n: number) => `今天还能免费抽 ${n} 次`,
    freeDone: '今天的免费次数用完啦，明天再来',
    watchAd: '看个小广告，免费抽',
    surprise: '惊喜来袭！',
    gotCard: '集到新卡',
    gotDup: '重复啦，已转成碎片',
    pity: '好运加持，稀有卡来啦',
  },

  rank: {
    title: '好友速度榜',
    empty: '邀请好朋友一起来拼图吧',
    invite: '邀请好友',
    seasonClosed: '全服赛季榜将于二期开放',
  },

  common: {
    sure: '确定',
    cancel: '再想想',
    close: '关闭',
    later: '稍后',
    ok: '好哒',
  },
};

export default Copy;
