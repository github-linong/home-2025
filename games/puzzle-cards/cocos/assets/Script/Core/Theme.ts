// cocos/assets/Script/Core/Theme.ts
// 美术主题（拼拼卡 · AI 手绘暖色糖果风）
//
// 主色拾自决策文档：#FF9A6C（暖橘糖果色），目标用户为女性 + 儿童。
// Cocos 侧可用 `cc.color.fromHEX(new cc.Color(), Theme.color.primary)` 转换。
export const Theme = {
  // 主色 / 辅色（16 进制字符串；避免在代码里写死纯黑纯白，更柔和）
  color: {
    primary: '#FF9A6C', // 主色：暖橘（按钮、高亮、CTA）
    primaryDark: '#F2774A', // 按下 / 渐变深一档
    primaryLight: '#FFE0CE', // 浅橘底（卡片背景）
    accent: '#FFD66B', // 点缀：暖黄（星星、徽章）
    accentPink: '#FFB3C7', // 粉（女性向点缀）
    bg: '#FFF7F1', // 页面暖白底
    bgDeep: '#FFE9DD', // 深一档底
    text: '#5A4A42', // 暖棕正文（避免纯黑）
    textLight: '#9B8A82', // 次级文字
    success: '#7BC67B', // 完成绿
    // 稀有度色（卡牌边框 / 底色）
    rarity: {
      N: '#C9BBAF',
      R: '#7FB4E8',
      SR: '#C79BF0',
      SSR: '#FFB454',
      HIDDEN: '#FF8FB0',
    },
  },

  // 资源约定：美术资源统一放 textures/，按系列 + 卡牌 id（目录内文件名即卡牌 id）命名。
  // 例：textures/series/flower/flower_001.png ，textures/pieces/board_bg.png
  // cardId 传卡牌目录 id（如 flower_001），与 config/cards.json 的 id 字段一致。
  assetPath: {
    seriesArt: (seriesId: string, cardId: string) => `textures/series/${seriesId}/${cardId}`,
    boardBg: 'textures/pieces/board_bg',
    pieceMask: 'textures/pieces/piece_mask',
    ui: (name: string) => `textures/ui/${name}`,
    splash: 'textures/brand/splash',
  },

  // 字体偏好：圆润可爱（Cocos 字体资源名；缺失时回退系统 sans）
  font: {
    display: 'fonts/rounded',
    body: 'fonts/rounded',
  },

  // 视觉参数（Cocos Widget / UIOpacity / Graphics 圆角用）
  radius: { card: 24, button: 28, panel: 32 },
  shadow: { offsetY: 6, blur: 16, color: 'rgba(242,119,74,0.18)' },
};

export default Theme;
