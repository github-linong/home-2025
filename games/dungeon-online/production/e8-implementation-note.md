# E8 实现说明 · 协作技（系统⑨，闭合 O-A 设计缺口）

**路径**：`games/dungeon-online/production/e8-implementation-note.md`
**负责人**：程基岩（engineering-lead）
**阶段**：Phase 5 制作（Epic E8 / S8.1–S8.3）
**引擎**：Godot 4 + 浏览器端；权威模拟为 TypeScript（`packages/sim-core/`）
**状态**：已实现，全量测试通过，golden 未变更（无需重锁）

## 1. 本次实现的协作技（均为「影响盟友」的协同能力，非 solo）

| 技能 | id | 目标模式 | 效果（P5 平衡初稿，待调） | 冷却 | 落地方式 |
|---|---|---|---|---|---|
| `SHIELD_ALLY` 护盾链接 | 0 | ALLY（其他玩家） | 给目标盟友施加减伤护盾窗口；窗口内受到伤害 ×(1−0.5)（减伤 50%），持续 3s(90tick) | 12s(360tick) | world.step 设 `target.shieldUntilTick`/`shieldReduction` → `combat.resolveDamage` 消费 |
| `REVIVE_BOOST` 急救链 | 1 | ALLY（须倒地） | 给倒地盟友救援读条直接 +1.5s(45tick)，加速归队 | 10s(300tick) | world.step 给 `target.rescueTicks += 45`（非 hp/status） |
| `TAUNT` 嘲讽战吼 | 2 | SELF（施法者自身） | 施法者吸引敌火 4s(120tick)，敌人 AI 优先锁定施法者，保护其他队友 | 14s(420tick) | world.step 设 `caster.tauntUntilTick` → 敌人 AI 经 taunt 池优先锁定 |

> 数值均为 MVP 第一稿（`SKILL_PROTOTYPES` 集中管理，集中可调）。减伤比例、各冷却/窗口时长均写在 `types.ts` 的 `SKILL_PROTOTYPES` 表里，未散落。

## 2. 意图结构体（SkillApplication）与数据流

- `types.ts`：`SkillTargetMode` / `SKILL_IDS` / `SkillEffect` / `SkillPrototype` / `SKILL_PROTOTYPES` / `getSkillPrototype()`。定义即数据，无运行时逻辑。
- `skills.ts`（**新增，纯模块**）：`resolveSkillApplication(caster, target, skillId, tick): SkillApplication | null`
  - 只做**纯校验 + 效果数学**：按目标模式校验（ALLY 必须指向其他玩家、不能指向自己/敌人；REVIVE_BOOST 要求目标倒地；SELF 只作用于施法者；托管中/未知 id 一律拒绝），返回不可变的 `SkillApplication` 意图结构体。
  - **绝不**直改任何实体状态（纪律 B）。静态契约见 §4。
- `world.step` 消费意图落地：根据 `app.shieldTicks / rescueBoostTicks / tauntTicks` 设置 `shieldUntilTick`、`rescueTicks`、`tauntUntilTick`，并写入 `cooldownUntilTick` / `activeSkill`。所有 hp/status 改变仍只经 `combat.resolveDamage` / `world.step` 两个单一出口。

`InputCmd` 复用现有 schema：`action = SKILL`、`target = 盟友实体 id`（ALLY 技能）、`param = 技能 id`（SKILL_IDS）。SELF 技能（TAUNT）可不带 target。

## 3. 纪律 B（hard discipline）遵守情况

- **唯一 hp/status 变更点**仍为 `combat.resolveDamage()` 与 `world.step()`。
- `SHIELD_ALLY` 的减伤在 `combat.resolveDamage` 内落地（新增 `target.shieldUntilTick` / `target.shieldReduction` 判定，仅按比例减免 `dmgBase`；未设置护盾时该分支不触发，行为与原先完全一致）。
- `REVIVE_BOOST` 改的是 `rescueTicks`（非 hp/status）；`TAUNT` 改的是 `tauntUntilTick`（非 hp/status）。二者均在 `world.step` 内完成。
- `enemy-ai.ts` 仅新增一个只读 `taunt?: boolean` 标志并据此优先锁定嘲讽者，**未**新增任何 `hp=`/`status=` 变更，也未运行时 import combat/dungeon-gen（仍是纯模块）。
- 静态扫描确认：`packages/sim-core/src` 下所有 `.hp=` / `.status=` 赋值**仅**出现在 `combat.ts` 与 `world.ts`；`skills.ts` / `types.ts` / `enemy-ai.ts` / `rescue.ts` / `input.ts` 均无。

## 4. 测试与验证结果（精确计数）

| 套件 | 命令 | 结果 |
|---|---|---|
| sim-core 单元测试 | `cd packages/sim-core && node --experimental-strip-types --test "tests/unit/*.test.ts"` | **51 pass / 0 fail**（基线 43 + 新增 coop-skill 8 例） |
| sim-core golden | `node --experimental-strip-types --test "tests/golden/*.test.ts"` | **8 pass / 0 fail** |
| dungeon-server | `cd apps/dungeon-server && npm test` | **28 / 28 #fail 0**（无回归） |
| playtest 核心闭环 | `node scripts/playtest-core-loop.mjs`（repo 根） | **7 / 7，exit 0** |

- 新增 `tests/unit/coop-skill.test.ts` 含 **8** 个用例：SHIELD 护盾落地 + 不直改 hp/status、护盾减伤经 `resolveDamage` 生效、REVIVE 加速倒地救援 + 健康盟友 no-op、TAUNT 吸引敌火（含对照组）、冷却强制、协作技只能指向其他玩家盟友（self/enemy 拒绝）、纪律 B 静态契约、纯函数 `resolveSkillApplication` 校验。
- **golden 是否变更**：**未变更，无需重锁**。
  - `tests/golden/world-determinism.test.ts` 的 `GOLDEN_WORLD_HASH` 仍字节相等（golden 场景不发出 SKILL 输入，且新增的 Actor 字段未进入 `snapshot()` 序列化，故世界哈希不变）。
  - `scripts/playtest-core-loop.mjs` 的 `GOLDEN_PLAYTEST_HASH` 仍字节相等（playtest 只发 ATTACK/DODGE/MOVE，技能意图路径不进入核心闭环）。

## 5. 实现要点与风险备注

- 协作技状态（`cooldownUntilTick` / `activeSkill` / `shieldUntilTick` / `shieldReduction` / `tauntUntilTick`）加在 `world.ts` 的 `Actor` 上；`snapshot()` 未序列化这些字段（保持 golden 稳定），Godot 客户端接入时如需同步护盾/嘲讽状态，再由客户端团队在 `EntityState` 上补可选字段——但本仓库无需改动即可维持确定性。
- `SHIELD_ALLY` 减伤走 `combat.resolveDamage` 的单一出口，与 DODGE 的 IFRAME 全免伤正交：同时持有护盾与 i-frame 时，i-frame 优先（全额免伤），符合预期。
- `TAUNT` 改变的是敌人「目标选择」（移动 + 攻击都优先嘲讽者），不修改敌人伤害数值，与敌我伤害分离（C11/D12）兼容。
- 未触碰 GDD / QA 文档（由 design-strategist / tester 成员各自负责）；未提交（按指示）。

## 6. 下一步建议

- P5 调优：减伤比例 0.5 / 各冷却与窗口时长是初稿，建议接入真实 4 职业后按职业差异化（GDD⑨ S8.3 提及坦护盾墙 / 医者救援链 / 控场合围）。
- 客户端（Godot）：实现技能触发输入、HUD 技能槽与冷却环、护盾/嘲讽视觉（阵营色，参见 art-bible §3）。
- 待 ⑨ GDD 正式落盘后，回填 `design/ux/ux-spec.md` 中「待 ⑨ GDD 补完回填」的协作技 UX 占位段。
