# 资产清单与规格（Asset Specs）· DRAFT v0.1（Phase 4）
> **状态：DRAFT v0.1 · MVP 可访问性档 = `Standard`** ｜ 主理人确认用
> **对齐**：art-bible §2（调色板）/§2.6（强提醒色<8% + DANGER 豁免）/§4（角色）/§5（怪物三档）/§6（环境三套语言）/§7（UI）/§8（VFX）/§9.1（规格初稿）/§11（字体图标）；accessibility.md（19 项特性矩阵）
> **风格已锁定**：水墨像素（ink-pixel）· 基础格 **48px native（已锁定）** · 单主角武侠英雄。

## 0. 全局约定
- **像素格式**：native 设计基准 **48px tile**；**source 以 2× 母版制作**（tile 96px / 角色 96–112px / Boss 288–480px），导出 atlas 用 **`Nearest` 过滤 + 整数对齐**，runtime 显示缩放 1×/1.5×/2×（accessibility #9 字体缩放）。
- **朝向/帧**：角色与敌人 4 向（上/下/左/右）；**左/右由右向镜像**降本。动画帧独立于 tick——远程实体由工程按网络插值（30Hz 缓冲），美术只供关键 pose。
- **DANGER 豁免条款（art-bible §2.6 已锁定）**：telegraph 预警区 **不计入** 全局强提醒色 8% 上限，改「自身亮度（第1帧静态可读）+ 同屏数量预算」管理；仅非 telegraph 的 UI/装饰守全局 <8%。
- **档位图例**：Basic=不可砍红线 / Standard=MVP 交付 / Comprehensive=后续里程碑。每项标「成本（低/中/高）」「数量预估」「优先级（P0 核心循环 / P1 Standard 增强 / P2 打磨）」。
- **命名约定**：
  - tile：`assets/tiles/{safe|wild|dungeon}/{tile}_{variant}.png`（如 `tiles/safe/floor_warm_v2.png`）
  - 角色：`assets/chars/hero_{action}_{facing}_{frame}.png`（如 `chars/hero_attack_down_02.png`）
  - 怪物：`assets/mobs/{normal|elite|boss}/{mob}_{action}_{facing}_{frame}.png`
  - UI：`assets/ui/{hud|inv|icon|portal}/{name}.png`
  - VFX：`assets/vfx/{type}_{name}_{frame}.png`（如 `vfx/elite_spawn_03.png`）

## 1. 地图（三套 tile 集 · 48px 水墨像素）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 安全区 tile（集镇/暖） | floor_warm×3、wall_top_warm、wall_side_warm、roof、wood_beam、lantern、banner_red、door、stall、fountain、bridge、path；48px(2×96)；WARM_STONE/LANTERN/AMBER 系（§2.1） | Basic | 高 | 14–18 | P0 |
| 刷怪区 tile（荒野/冷） | floor_wild×3、wall_rock×2、cave_floor、moss、bone_decor、rift_edge_cold、bush_sickly；48px(2×96)；CORPSE_BLUE/SICKLY/VOID 系（§2.2） | Basic | 高 | 12–16 | P0 |
| 地牢入口 tile（裂隙异象） | portal_core、portal_ring、portal_swirl(动画4帧)、threshold、warning_rune；48–96px；RIFT `#7B5CC4`+RIFT_TEAL `#3FB6B0`（§2.3/§6.3） | Basic | 中 | 6–10 | P0 |
| 共享 | shadow_blob、selection_ring、fog_overlay（未探索遮罩 BG_DEEP 暗化 + 已探索静态边界）、safe-zone glow（LANTERN 暖光 halo） | Basic | 低 | 4 | P0 |

## 2. 角色（单主角武侠英雄）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 英雄主体 sprite | native 48–56px 高（约 1 格，source 96–112px）；4 向；**帧需求：idle×2 / walk×4 / attack×3 / block×2 / hurt×1 / death×4**；墨线轮廓 2px、玄黑/墨青袍+朱砂束带（§4）；调色板 ≤24 色 | Basic | 中 | 1 模型 | P0 |
| 阵营色描边/名牌 tint | P1–P4（`#4CB5F5`/`#9B7BE8`/`#E86FB0`/`#6FD68A`，§2.4）；仅描边/名牌/自身技光效 | Basic | 低 | 4 tint | P0 |
| 武器/装备 silhouette 变体 | 刀/剑/枪/扇 剪影（多人靠装备+名牌区分，§4/§12 决策3）；可换装图层 | Basic | 中 | 4 | P1 |
| 受击/死亡特效 | hurt 红闪（DANGER 描边，不靠细微动效）、death 碎裂墨点 | Basic | 低 | 2 | P0 |

## 3. 怪物（三档：普通 / 精英 / BOSS）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 普通怪 sprite | native 32–44px(2×64–88)；去饱和冷躯体（CORPSE_BLUE/VOID）；4 向；idle2+walk4+attack2；红仅攻击前摇 DANGER 闪现（§5.1） | Basic | 中 | 3–4 原型 | P0 |
| 精英 / 蓝怪 sprite | native 48–64px；钢蓝 `#5F8FB0` tint + 青环 `#5FD0E0` + 精英图标（王冠/双剑）；aura 可主题变（§5.2） | Basic | 中 | 2–3 | P0 |
| 精怪型小妖 | native 32–44px；虚空紫/裂隙青微缠绕、畸变轮廓，无常驻 aura（§5.1） | Basic | 中 | 1–2 | P1 |
| BOSS sprite（妖王/大妖） | native 144–240px 多部件（2×288–480）；阶段色（VOID→RIFT→DANGER 预警态）+ 强异象 aura + 妖纹图标；分阶段 2–3（§5.3） | Basic | 高 | 1–2 | P0/P1 |
| 怪物头顶图标集 | 无(普通)/王冠·双剑(精英)/妖纹(BOSS)；≥16px@source，白+黑双描边（三重编码，§5.4） | Basic | 低 | 3 | P0 |
| telegraph 静态模板 | 形状(圆环/AOE填充/弧/陷阱格) + `#E5484D` 色块 + 图标；**单帧第1帧自洽**；AOE≥2tile(普通)/≥3tile(BOSS)；线宽≥2px@source；跨敌种复用（§2.6/§5.3） | Basic | 中 | 4–6 模板 | P0 |

## 4. UI（Canvas UI · 暗调一致）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| HUD 血条/体条 | 角色头顶细条（阵营色底+白描边）；**血(HP) + 体(stamina，代内力，§任务说明)** 双条；条形 9-slice | Basic | 低 | 2 条 | P0 |
| 技能栏 | 圆角石面格 ×**4**（推荐 3–4），阵营色激活辉光；冷却环形遮罩（不靠变色）；source ≥32px | Basic | 中 | 4 格+辉光 | P0 |
| 名牌 | 头顶底板（阵营色边）+ 名字位；多人区分（§4） | Basic | 低 | 1 | P0 |
| 掉装提示 | 右侧滚动 ticker（稀有度色+图标+文字）；传说/神话居中横幅+辉光（§7） | Standard | 低 | 1+横幅 | P1 |
| 背包 / 词缀展示 | 暗色卷轴/竹简面板；词缀 chip（白/绿/蓝/紫/橙/红 六档边框，§2.5）+ 图标 + 文字；高对比 tooltip（§7） | Standard | 中 | 1 面板+6 chip | P1 |
| 地牢入口传送点 UI | portal marker 图标 + 入口横幅 + 进入确认（RIFT 紫青，§6.3） | Basic | 低 | 2 | P0 |
| 状态/控制提示图标 | 眩晕/减速/增益/DoT/格挡；屏内键位图例（accessibility #8）；native 16–24px 双描边 | Standard | 低 | 6–8 | P1 |
| 小地图框 / 连接指示 | 顶部地图小窗（安全/危险区色块）；右上 ping/重连指示（多人必显） | Basic | 低 | 2 | P0 |

## 5. VFX（攻击/技能/掉落/精英登场/BOSS 阶段异象）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 攻击刀光 | 弧光（阵营色/武器色）+ 命中火花（小短）；source ≥48px | Basic | 低 | 1–2 | P0 |
| 技能辉光 | 阵营色冲击波/剑气/符箓；每技能 1（推荐 4 技能）；不与 DANGER 混淆 | Basic | 中 | 4 | P1 |
| 掉落微光 | 物品落地微光（稀有度色）+ 拾取上飘星点 | Standard | 低 | 1 套 | P1 |
| 精英/精怪登场 | 异象脉冲（RIFT 紫青漩涡）+ 地面裂痕 + 短暂暗角（§8） | Basic | 中 | 1 | P0 |
| BOSS 阶段异象 | 全屏轻暗 + 妖纹脉冲 + 地面异象升级；分阶段切换轮廓光/能量色（§5.3/§8） | Basic | 高 | 2–3 | P1 |
| 装饰粒子（可减弱） | 尘埃/烟/灯笼火星；reduced-motion 可关，静态预警 SHAPE 保留（accessibility #10） | Standard | 低 | 2–3 | P2 |

## 6. 待 P2/P3 收口项（方向已锁定，细节后置）
- 风格已定水墨像素、基础格 48px（art-bible §12 已锁定）。
- 【待引擎】字体缩放/色盲开关/reduced-motion 持久化由 engineering-lead 实现，美术供图标与 alt 调色板（accessibility §5）。
- 【待GDD】怪物类目、地牢入口刷新逻辑、技能具体数量（3–4）、是否多职业扩展。

---

— 林绘澄（art-director）｜ DRAFT v0.1 · Phase 4 · 对齐 art-bible §2/§4/§5/§6/§7/§8/§9.1/§11 + accessibility.md
