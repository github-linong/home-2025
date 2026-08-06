# E8 协作技 UX 回填 · Reconcile Note

**Epic**：E8（协作技落地，闭合 O-A）
**任务**：将 `design/ux/ux-spec.md` 中 §2/§3/§4/§6 的「待 ⑨ GDD 补完回填」占位段，按 `packages/sim-core/src/types.ts` 的 `SKILL_PROTOTYPES` 权威值回填。
**阶段**：Phase 5 生产
**纪律**：只读 `src/`，仅改 `design/ux/ux-spec.md`；代码 = source of truth。

## 权威源（types.ts 钉值）
- `SKILL_IDS`：SHIELD_ALLY=0 / REVIVE_BOOST=1 / TAUNT=2
- `SkillTargetMode`：SELF=0 / ALLY=1（ENEMY=2 预留未启用）
- `SKILL_PROTOTYPES`（均 `castTicks=0`，即时、服务器权威）：
  - SHIELD_ALLY：`shieldReduction=0.5`（减伤 50%）、`shieldTicks=90`（3s）、`cooldownTicks=360`（12s）、`targetMode=ALLY`
  - REVIVE_BOOST：`rescueBoostTicks=45`（+1.5s 救援读条）、`cooldownTicks=300`（10s）、`targetMode=ALLY`
  - TAUNT：`tauntTicks=120`（吸火 4s）、`cooldownTicks=420`（14s）、`targetMode=SELF`
- 输入语义：`InputCmd.action=SKILL`，`target`=盟友实体 id（ALLY 必须指向其他玩家）/空（SELF），`param`=技能 id（`SKILL_IDS`）。

## 回填位置 → 权威值映射
| UX 段落 | 回填内容 | 权威源 |
|---|---|---|
| §0.1 续（协作技初稿值注记） | 三技能减伤/窗口/CD 汇总 + 输入语义 | `SKILL_PROTOTYPES` |
| §2 战 Fight · ⑨ 协作技 | 三技能描述 + 效果叠加连携 | `SKILL_PROTOTYPES` |
| §3 · ⑨ 协作技输入 | `InputCmd.action=SKILL` / `target` / `param` 语义 | `InputCmd` / `SKILL_IDS` |
| §4 底中技能栏 | 协作技栏 3 槽 + 各自 CD + ALLY 选目标 / SELF 一键 | `SKILL_PROTOTYPES` |
| §6 · ⑨ 协作技信号联动 | 复用 ⑩ 急救/集合/危险语义 + 被请求协作提示 | — |
| §0.3 / 纪律 / Handoff | 「⑨ 预留/占位」→「E8 钉值，UX 已回填」 | — |

## 顺带一致性修复
- Handoff 段遗留陈旧值 `DOWNED 15–20s·救援3s·自救5s` → 修正为 `DOWNED 20s·救援3s·自救10s`，与 §0.1 锁定表 / ⑪ 一致（E13 O-A7 已统一）。
- 修正一处被并发编辑破坏的缩进：战 Fight 子项（敌人攻击 telegraph / 玩家操作反馈）从 2-space 还原为 4-space 嵌套。

## 待用户拍板项（P5 草案，非 ADR 锁定）
- 三技能数值为平衡初稿，待用户确认后回填 **⑨ GDD 正文**（系统八节）。
- 如需职业差异化 4 技能版（坦护盾墙 / 医者救援链 / 控场合围），扩展 `SKILL_PROTOTYPES` 即可；本 UX 已采用「共用技能键 + 选目标」语义，结构无需改动。

## 范围纪律
- 未修改 `packages/sim-core/src/*` 与 `apps/*`（仅读取核对）。
- `design/gdd/09-coop-skills.md`（⑨ GDD 正文）尚未产出，待用户拍板 P5 数值后由 design-strategist 编写。

## 状态
**E8 UX 占位回填 = RESOLVED**（O-A 闭合的 UX 侧完成；⑨ GDD 正文待用户拍板后补）。
