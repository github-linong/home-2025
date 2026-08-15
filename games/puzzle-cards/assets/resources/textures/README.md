# textures · 美术资源（拼拼卡 · AI 手绘暖色糖果风）

> 本目录由 `scripts/gen-textures.mjs` 生成（DashScope 通义万相）。缺失时客户端 `addImage` 自动退化稀有度色块，不影响运行。

## 目录约定（与 `assets/Script/Core/Theme.ts` 的 `assetPath` 契约一致）

```
textures/
├── series/{seriesId}/{cardId}.png   # 73 张卡面（68 普通 + 5 隐藏）
├── pieces/board_bg.png              # 拼图底板背景
├── pieces/piece_mask.png            # 碎片遮罩（程序化，暂不需要）
├── ui/{name}.png                    # UI 图标（按钮/徽章等，后续按需）
├── brand/splash.png                 # 启动闪屏
└── manifest.json                    # 最近一次生成记录（脚本写入）
```

`seriesId` / `cardId` 与 `config/cards.json` 的字段一一对应（例：`series/flower/flower_001.png` = 玫瑰）。

## 生成

```bash
node scripts/gen-textures.mjs --dry-run      # 预览全部提示词
node scripts/gen-textures.mjs --limit=5      # 试跑 5 张
node scripts/gen-textures.mjs                # 全量 73 张（需 DASHSCOPE_API_KEY）
node scripts/gen-textures.mjs --ui           # 生成 board_bg / splash
node scripts/gen-textures.mjs --series=star --force   # 重跑某系列
```

## 提示词模板

**风格前缀（所有卡面共用）**：

```
暖色糖果风儿童绘本插画，柔和圆润造型，奶油白与暖橘色(#FF9A6C)主色调，浅粉与暖黄点缀，
软萌可爱，画面干净明亮，方形卡片构图，主体居中特写，柔和高斯光晕背景，
无文字，无水印，无边框，无logo。
```

**系列主题**：

| 系列 | 主题句 |
|---|---|
| flower 花语集 | 主题：一株盛开的花朵。花瓣圆润饱满，点缀柔和的叶子与晨露，清新治愈。 |
| pet 萌宠志 | 主题：一只可爱的小动物。Q版圆润身材，大眼睛，毛茸茸质感，憨态可掬。 |
| food 食光记 | 主题：一份诱人的美食。拟人化可爱的表情，热气腾腾，温馨治愈。 |
| landscape 山河卷 | 主题：一处美丽的风景。简化可爱的几何山峦与云朵，童话质感。 |
| star 星辰谱 | 主题：星座与星空。可爱的星星与星座连线，闪烁光点，梦幻夜空。 |

**稀有度点缀**：N 简洁清爽 / R 背景点缀少量星星与光点 / SR 柔和光晕与闪粉 / SSR 金色光辉环绕、彩带光斑 / HIDDEN 神秘彩虹光晕。

## 资源清单

- **卡面 73 张**：花语集 13（含隐藏）、萌宠志 17、食光记 17、山河卷 13、星辰谱 13
- **UI 图 2 张**：`pieces/board_bg`、`brand/splash`（`--ui` 生成）
- 稀有度色块兜底色（客户端缺图时）：N `#C9BBAF` / R `#7FB4E8` / SR `#C79BF0` / SSR `#FFB454` / HIDDEN `#FF8FB0`

## 规范

1. **无文字无水印**是硬约束（提示词已含；抽检时重点检查，尤其 splash 区域）。
2. 系列一致性 > 单张质量：抽检发现风格漂移，用 `--force` 重跑该张并调整系列主题句。
3. 生成的大 PNG 建议进 .gitignore（按需），正式包体走分包/远程资源（≤20MB 总包约束）。
4. 隐藏卡（`*_H01`）仅在特殊条件获得，卡面允许比普通卡更华丽，但风格不能跳系列。
