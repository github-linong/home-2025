# MVP 资产清单与规格（Asset Spec）· FINAL v1.0（已批准落盘）
> **状态：FINAL v1.0 · 已批准落盘（Sprint 1）** ｜ 主理人确认用
> **对齐**：art-bible §3/§4/§6/§7/§8/§10、accessibility.md（19 项特性矩阵）、telegraph-inequality-cost.md §2
> **MVP 可访问性档位 = Standard**（Basic ⊆ Standard ⊆ Comprehensive；Comprehensive 标"后续里程碑"不进 MVP 生产）
> **说明**：⑥ 资源 / ⑨ 协作技 / ⑩ 信号 / ⑫ 进度 / ⑬ HUD 未单列八节 GDD 文件，资源类型（药品/弹药/增益）与信号类型（ping/危险/集合/急救/表情）取自 systems-index §6 与各已写 GDD 的交叉引用。

## 0. 全局约定
- **像素格式**：native 设计基准 **32px tile**（art-bible §6/§7）；**source 以 2× 母版制作**（tile 64px / 角色 64–96px），导出 atlas 用 **`Nearest` 过滤 + 整数对齐**，runtime 显示缩放支持 1×/1.5×/2×（accessibility #10 字体缩放）。
- **朝向/帧**：角色与敌人 4 向（上/下/左/右）；动画帧独立于 tick——远程实体由工程按 30Hz 插值（100ms 缓冲），美术只供关键 pose，无需 per-tick 帧。
- **DANGER 豁免条款（用户已批，art-bible §3）**：telegraph 预警区 **不计入**全局强提醒色 8% 上限，改由「**自身亮度**（第1帧静态可读，不靠细微动效）+ **同屏数量预算**（单屏并存 telegraph 数上限，由 ⑧ 敌人与 AI 调度）」管理；仅"非 telegraph 的 UI/装饰"守全局 <8%。
- **P3 不等式落实**：telegraph 资产**静态单帧、第1帧自洽**；拉长前摇只延长引擎持有，**不增重绘**（telegraph-inequality-cost §2/§3）。
- **档位图例**：Basic=不可砍红线 / Standard=MVP 交付 / Comprehensive=后续里程碑。每项标「成本（低/中/高）」「数量预估」「生产优先级（P0 核心循环 / P1 Standard 增强 / P2 打磨）」。

## 1. 角色（4 职业 · 阵营色描边/名牌/技光效）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 角色主体 sprite（守卫士/游侠/术士/医者） | native 32–48px(2× 64–96px)；4 向；idle 2 + walk 4 + 受击 1；调色板 ≤16–24 色/角色；圆润微 Q 剪影（§4） | Basic | 中 | 4 | P0 |
| 阵营色描边/名牌 tint（P1–P4 HEX §3） | 4 色描边 + 头顶名牌底板；仅用于描边/名牌/自身技光效 | Basic | 低 | 4 tint | P0 |
| 职业图标（盾/弓/尖帽/十字光环） | native ≥16px(2× ≥32px)；白/黑描边，三重编码 | Basic | 低 | 4 | P0 |
| 技能/协作技光效 VFX（faction 色辉光） | 每职业 1 主动 + 1 协作技（⑨ MVP）；faction 色，不混淆 DANGER | Basic | 中 | 8 | P1 |

## 2. 敌人（杂兵/精英/Boss · 锐角去饱和 + DANGER rim）+ telegraph
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 杂兵 sprite | native 32–40px(2× 64–80px)；去饱和躯体 + 攻击态 DANGER rim；4 向；idle2+walk4+attack2 | Basic | 中 | 2–3 原型 | P0 |
| 精英 sprite | native 48–64px；专属剪影 + 常驻 DANGER rim | Basic | 中 | 1–2 | P0 |
| Boss sprite（余烬矿坑） | native 96–160px 多部件；分阶段 2–3（⑦/⑧） | Basic | 高 | 1 | P0/P1 |
| **telegraph 静态模板** | 形状(圆环/AOE填充/弧线/锥形/陷阱格) + `#E5484D` 色块 + 图标(≥16px@source, 白/黑描边)；**单帧第1帧自洽**；AOE 直径≥2 tile(128px@2×)；线宽≥2px@source；可复用跨敌种 | Basic | 中 | 4–6 模板 | P0 |
| 陷阱/机关静态预警 | 同 §7 纪律，独立模板 | Basic | 低 | 1–2 | P0 |

> telegraph 全部套用 §0 DANGER 豁免（不计入 8%）。

## 3. 环境（余烬矿坑 biome）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 地形 tile 集 | floor / wall-top(STONE_HI=不可走高光) / wall-side / 裂纹 / 苔藓；32px native(2× 64px) | Basic | 高 | 12–20 | P0 |
| 房间类型装饰/标记 | 休息点(余烬暖光 campfire EMBER/GOLD) / 资源房标记 / Boss 房 arena 边界 / 出口 portal(GOLD) / 战斗房(无) | Basic | 中 | 5 组 | P1 |
| 战争迷雾样式 | 未探索遮罩(BG_DEEP 暗化) + 已探索边界**静态形状**区分（⑤§7）；并集由 ⑬/程基岩输出 | Basic | 低 | 1 overlay+边界 | P0 |
| 暖光/安全区 glow | campfire、safe-zone halo（EMBER/GOLD，暖色=安全语义） | Basic | 低 | 2–3 | P1 |
| 玩家 Light2D radial | 中性径向渐变 sprite（非 faction 色）；【待引擎】 | Basic | 低 | 1 | P1 |

## 4. 资源节点（GOLD 描边）
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 资源节点（药品/弹药/增益） | 圆角方框 + GOLD `#F4C95D` 描边 + 类型图标（形状+金+图标 三重编码，§4） | Basic | 低 | 3 | P1 |
| 门/出口/拾取反馈 | 复用 GOLD 描边母题；拾取闪光（短/静态） | Basic | 低 | 1–2 | P2 |

## 5. UI/HUD 组件
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 环形进度（救援/读条/自救） | 静态环形 + 图标，**不靠变色**（§8/⑪§7）；neutral 或 faction tint；含 fill 动画但静态形状保留 | Basic | 低 | 1 模板(复用) | P0 |
| 阵营名牌 | 头顶底板(faction 色) + 文本由字体渲染 | Basic | 低 | 1+4 tint | P0 |
| ping/重连指示 | 图标(连接质量 good/reconnecting) + 文本(ping ms)，**三重编码不靠色**（①§7/§8） | Basic | 低 | 2–3 状态 | P0 |
| 信号图标集（⑩） | ping / 危险 / 集合(Regroup) / 急救呼救(⑪) / 表情；native 16–24px；三重编码 | Basic | 低 | 5–6 | P1 |
| 菜单面板 + 控件 | 石面 panel + GOLD 描边 + 圆角（§8）；按钮/滑块/开关（设置：色盲开关/字体缩放/减弱动效/telegraph 切换 = Standard 项） | Standard | 中 | 1 套 | P1 |
| 队伍面板 | 4 头像框(faction) + 血条 + 状态位 | Basic | 中 | 1 套 | P1 |
| Boss 血条 + 阶段标记 | 顶部长条 + 阶段文字/图标（三重编码） | Basic | 低 | 1 | P1 |
| HUD 状态图标 | 眩晕/减速/增益/DoT；native 16–24px（accessibility #9 图标冗余） | Basic | 低 | 4–6 | P1 |

## 6. 字体与图标集
| 资产 | 规格 | 档位 | 成本 | 数量 | 优先级 |
|---|---|---|:--:|:--:|---|:--:|
| 像素字体 | crisp；最小可读字号；高对比(WCAG AA 4.5:1，力争 7:1)；整数档 1.0×–1.5×（accessibility #10）；2 字重 | Standard | 中 | 2 字重 | P1 |
| 主图标集（汇总） | 状态/资源/信号/环形/职业/telegraph/阵营 统一栅格(16/24/32px native)；全三重编码 | Basic/Standard | 中 | ~30–40 | P1 |
| 色盲斜纹图案（Standard #8） | 危险物叠加斜纹 tiled pattern（色盲模式开关启用） | Standard | 低 | 1 | P1 |

## 7. Comprehensive（后续里程碑 · 不进 MVP 生产）
- 高级色盲（pattern fill + 形状变异 + 自定义调色板，#16）：额外图标变异集 + 调色板资源。
- 字幕框样式 + 音频冗余视觉（#15）。
- 音频可视化频谱条（#19）。
- 全键盘焦点环变体（#18）。
- 自由缩放 >1.5× 额外布局（#17）。
- 减弱动效高级（完全去屏震/闪光）静态变体（#11 high）。
- 扩展表情/信号动画。

## 8. 生产优先级汇总 + 数量预估
- **P0（核心循环 MVP 必做）**：4 角色、杂兵/精英/Boss、telegraph 静态模板、地形 tile、资源节点 GOLD、环形进度、阵营名牌、ping/重连指示、菜单 panel、像素字体、核心图标集、战争迷雾样式。
- **P1（Standard 增强）**：信号图标全集、队伍面板、设置 UI、色盲斜纹、状态图标、房间装饰/休息点/Boss房/出口、暖光 glow、Boss 血条、技能/协作技 VFX。
- **P2（MVP 内打磨）**：苔藓/裂纹变体、拾取反馈、Light2D radial。
- **数量粗估（MVP 生产集）**：角色 4 + 敌人原型 4–6 + telegraph 模板 4–6 + tile 12–20 + 资源 3 + HUD/图标 ~40–50 + 字体 2 字重 ≈ **70–90 个资产单元**（不含 Comprehensive）。

## 9. 开放问题 / 跨职能依赖
1. **【待引擎/程基岩】** Light2D radial、战争迷雾并集多边形输出、HUD ping/延迟/重连数据（⑬ 接口）——ping/重连指示与迷雾样式依赖此，已与 engineering-lead 协同（同 P3）。
2. **【待 design-strategist / 用户】** 是否需要 **CJK 像素字体**（游戏文本语种未定，影响字体资产范围）。
3. DANGER 豁免已落 art-bible §3；本规格在 §0 + §2 落实"telegraph 不计入 8%，由自身亮度 + 同屏数量预算(⑧调度)"。
4. 30Hz 插值(100ms 缓冲)对接：美术动画帧独立，telegraph 静态单帧无插值依赖（已写入 §0）。

---

# 审批记录（Handoff 已闭环）
- 用户于 Sprint 1 批准本资产规格并确认落盘；内容即 P4-ART 草稿，未改写专业判断。
- 本档由 art-director 产出、主理人确认落盘；未改动其他成员文档。

— 林绘澄（art-director）｜ 主理人确认落盘（Sprint 1 · asset-spec FINAL v1.0）
