# 美术资源约定（拼拼卡）

风格：**AI 手绘暖色糖果风（kawaii sticker）**，主色 `#FF9A6C`，面向**女性 + 儿童**。
柔和圆角、奶油质感、可爱动植物/治愈系插画，避免尖锐与高对比。统一 1024×1024 不透明 PNG。

## 目录结构（运行时由 `resources.load` 加载 — 必须放在 `assets/resources/` 下）

```
cocos/assets/resources/textures/
├── brand/
│   ├── splash.png          # 启动闪屏 ✅ 已生成（拼图+花+小狗+蛋糕+星星合场景）
│   └── brand-mark.svg      # 品牌标记（源码占位，可提交）
├── series/                 # 5 系列卡面，文件名 = 卡牌目录 id（与 config/cards.json 的 id 一致）
│   ├── flower/             # 花语集：flower_001…flower_012 + flower_H01（13 张）✅
│   ├── pet/                # 萌宠志：pet_001…pet_016 + pet_H01（17 张）✅
│   ├── food/               # 食光记：food_001…food_016 + food_H01（17 张）✅
│   ├── landscape/          # 山河卷：landscape_001…landscape_012 + landscape_H01（13 张）✅
│   └── star/               # 星辰谱：star_001…star_012 + star_H01（13 张）✅
├── pieces/
│   ├── board_bg.png        # 拼图底板背景 ✅ 已生成（浅奶油圆角面板+橘点/爱心）
│   └── piece_mask.png      # 碎片遮罩（预留，当前未引用）
└── ui/                     # UI：按钮/星星/卡框/弹窗（预留，当前面板用 solidFrame 色块兜底，未引用图片）
```

> 注意：客户端 `Core/Theme.assetPath.seriesArt(seriesId, cardId)` 返回 `textures/series/{seriesId}/{cardId}`，
> 相对 `assets/resources/`。**放错目录（如旧 `assets/textures/`）会导致 `resources.load` 取不到、回退色块。**

## 资源清单（数量基线，来自数值表）

- 卡面：**73 张**（5 系列共 68 普通 + 5 隐藏），已 100% 生成（2026-08-11）。
- 关键图：splash.png（闪屏）、board_bg.png（拼图底板）已生成。
- UI 套件（按钮/星星/稀有度卡框/弹窗）：当前未用图片资源 —— 面板/按钮由 `Core/UI.ts` 的 1×1 白色 `solidFrame` 着色兜底，无需图片。如后续要贴图，放 `ui/` 并改造 `addPanel/addButton`。

## AI 生图提示词模板（kawaii sticker · 已用于本次生产）

> Cute kawaii candy-colored sticker illustration of a single <主题>, soft warm palette with orange #FF9A6C,
> cream and pastel accents, simple rounded shapes, thick white outline, children-friendly, flat vector style,
> centered on plain light cream background, no text, no letters

- 隐藏卡（id 结尾 H01）：主题改为 "mysterious glowing magical <对应主题> with sparkles, rare and special"。
- 尺寸 1024×1024，quality medium，background opaque。

## 合规提示（提审相关）

- 儿童向素材避免真实货币、诱导充值、惊悚元素；纯 IAA（激励/插屏/Banner）。
- 卡面为原创 AI 插画，无真人肖像授权问题。
- 闪屏/弹窗文案统一走 `Core/Copy.ts`，禁负面词（见 README 文案规范）。
