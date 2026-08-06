# 核心循环 headless 可玩性验证报告（「好玩吗」验证门 · 形式化证据）

路径：`production/playtest-core-loop-report.md`
作者：程基岩（engineering-lead）｜ 状态：已落盘（用户已批准的「好玩吗」验证门证据）
对齐：epics E1(S1.3 30Hz run-runtime) + E3(S3 布局/生成) + E4(S4 每玩家输入路由) + E5(S5 系统⑦ 结算权威)
运行环境：Node v22.22.2（已用 `node --experimental-strip-types` 实跑确认）
约束：**本验证台为独立工具，未修改 `packages/sim-core/src` 与 `apps/dungeon-server/src` 任何运行时代码**，仅新建 `scripts/playtest-core-loop.mjs` + 本报告。

---

## 1. 验证门结论

> **核心循环机械闭环：成立（PASS）。**
> 在 headless（无 Godot 客户端）下，权威模拟核心循环（移动 → 攻击前摇 → 伤害结算 → 击倒；闪避 i-frame 免伤与解冻）端到端机械闭环，6/6 检查项全部通过。

| 项 | 值 |
|---|---|
| 检查项总数 | **6** |
| 通过 | **6** |
| 失败 | **0** |
| 退出码 | **0**（非 0 = 失败，CI 可据此 gate） |
| 确定性 world hash | `9f3769fe725bd1aaec3373cfff7204b09aeb9f335bd4580fc65e104586764e7d` |
| 既有回归套件（未改动，仅供参考） | sim-core **39/39** 绿 · dungeon-server **27/27** 绿（本工具不改运行时，无回归可能） |

> 说明：本验证台的确定性锚点（`GOLDEN_PLAYTEST_HASH`）是 **独立于** `world-determinism.test.ts` 的 `GOLDEN_WORLD_HASH` 的第二条 golden——前者锁 220-tick 含「移动+攻击+闪避+击倒」的核心循环序列，后者锁 26-tick 仅含一次 ATTACK 的序列。两者互不替代，共同锚定世界状态确定性（D9）。

---

## 2. 量化证据表

| 验证点 | 控制项 | 实测值 | 期望 / 契约 | 结论 |
|---|---|---|---|---|
| 移动速率（tank） | O2 | **4.6667 px/tick**（=140/30） | `CLASS_BASE.tank.moveSpeed/30` | ✅ |
| 移动速率（ranger） | O2 | **6.1667 px/tick**（=185/30） | `CLASS_BASE.ranger.moveSpeed/30` | ✅ |
| 前摇生效 tick 数 | D12 | **18 tick**（0.6s@30Hz） | `MIN_TELEGRAPH_TICKS=18` | ✅ |
| └ 前摇内敌人 hp | D12 | tick18=**40**（==发起前），tick19=**22**（-18） | 结算前不变、之后才扣 | ✅ |
| dodge i-frame 窗口 | O-M | **12 tick**（~0.4s@30Hz） | `DODGE_IFRAME_TICKS=12` | ✅ |
| └ 窗口内受击 hp | O-M / C11 | 140→**140**（不变） | i-frame 完全抵消 | ✅ |
| └ 窗口后 IFRAME 位 | O-M | tick44 IFRAME 位=**0** | 过期后清除，不永久冻结 | ✅ |
| └ 窗口后仍可移动 | O-M | x 1279.3→**1307.3**（前进） | 位运算门控解冻 | ✅ |
| C11 扣血恒值 | C11 | **-18**（amount=9999 与 amount=0 均如此） | `PLAYER_ATTACK_DAMAGE=18`，忽略 amount | ✅ |
| 敌人击倒 hp 阈值 | 系统⑦/S5.5 | hp=**0**，status=0b11（DOWNED 位真） | hp≤0 → DOWNED 位、hp 钳 0 | ✅ |
| 两次运行确定性 hash | D9 | 三次重跑 **字节级相等** 且 == 锁定 golden | 同 seed+输入 → 同哈希 | ✅ |

seed/biome 组合：`seed="EMBER-S1"`、`biomeId=0`（该组合稳定产出 ≥1 个 grunt，实测 13 个；首个 grunt id=11、hp=40/40，可在 220-tick 预算内击倒）。

---

## 3. 覆盖的控制项（与系统映射）

| 控制项 | 含义 | 本验证台如何覆盖 |
|---|---|---|
| **O2** | 移动速率接管（移除占位 MOVE_SPEED_PX） | (a) 两职业位移严格 = `moveSpeed/30`/tick |
| **D12** | telegraph 前摇 ≥18 tick | (b) ATTACK 发起后前摇 18 tick，结算前 hp 不变、之后才扣 |
| **O-M** | DODGE i-frame 免伤 + 玩家不被冻结（S5.3 world 编排层回归） | (c) 窗口内免伤 + 窗口后 IFRAME 位清除 + 仍可移动 |
| **C11** | 服务端权威伤害，拒伪造 amount（S5.7 反作弊基线） | (d) `resolveDamage` 对 amount=9999/0 均裁 -18；另 (c) 窗口内巨大 amount 受击被 i-frame 抵消 |
| **D9** | 世界状态确定性 golden（C7） | (f) 同 seed+输入三次重跑 sha256 一致且 == 锁定 golden |
| **C6** | 每玩家 seq 严格单调（输入门控） | 序列每个 cmd 带严格递增 seq，enqueue 返回 true（被拒则抛错）；拒绝路径由 `input.test.ts` 覆盖（绿） |
| 系统⑦ | 唯一伤害结算权威（`resolveDamage`） | 全部伤害经 ⑦；客户端无 amount 字段、结构上无法伪造 |
| 系统① | WorldSnapshot 兼容 | 确定性哈希即基于 `snapshot().entities`（含 `lastProcessedSeq`） |

---

## 4. 明确未覆盖项（诚实列出，不夸大）

以下各项**不影响「机械闭环成立」的结论**，但影响「主观好不好玩」的完整判定，需 Godot 客户端接入后人工评估或后续 Sprint 补全：

1. **S4.2 / S4.4 客户端预测 / 100ms 插值渲染（defer Godot）**：本验证台为 headless 权威模拟，不渲染、不插值；`lastProcessedSeq` 对账钩子已就绪但未在客户端验证回正手感。
2. **⑧ 敌人 AI 不输出伤害（E6）**：本 slice 敌人为占位 AI（1px/tick 逼近），不发射 telegraph / 不提交伤害请求；「敌人攻击是否有趣、可读性是否足够」未验证。
3. **⑪ 救援倒地 / OUT（E7）**：`resolveDamage` 仅置 DOWNED 位；自救/呼救/超时 OUT / D8 托管均未实现未测——击倒后「队友能否救、是否会 OUT」未知。
4. **O-B / O-C 碰撞检测 / 范围命中校验（S5.2/S5.4）**：战斗按 `targetId` 直击目标实体，未做空间距离 / 碰撞层 / 范围命中校验；当前 slice 由「选中目标即命中」近似。
5. **telegraph 视觉 / DANGER 豁免层（P3 静态可读预警，defer Godot/美术）**：仅 `TelegraphState` schema（shape/color/applyTick）存在；预警渲染与 DANGER 豁免层未接入，玩家肉眼看不出前摇预警。
6. **SKILL 技能差异化（defer）**：`world.ts` 当前将 SKILL 等同 ATTACK 路由（同 -18、同 18-tick 前摇），`skillId` 暂未驱动差异化。
7. **C5 perf / R1 二进制 state-diff（defer）**：本验证台未测带宽/p95/CPU；数据面仍为 JSON→Buffer 占位。
8. **主观「好不好玩」**：机制闭环成立 ≠ 手感好；四大支柱（P3 可读紧张等）需客户端渲染 + 真人试玩评估，headless 无法替代。

> 结论边界：**「机械上能玩、能打、能躲、能击倒、且确定性可复现」已形式化证明；「好不好玩」需 Godot 客户端接入 + 人工试玩再评估。**

---

## 5. 如何复跑

```bash
# 前置：Node >= 22.6（已用 v22.22.2 验证），无需安装依赖（sim-core 无外部依赖）
cd games/dungeon-online

# 运行核心循环验证台（打印 6 项检查 + 确定性 hash；EXIT 0 = PASS）
node --experimental-strip-types scripts/playtest-core-loop.mjs
echo "EXIT=$?"   # 0 = 全部通过；非 0 = 存在失败项

# （可选）顺带确认既有回归套件未受影响（本工具不改运行时，理论无回归）
cd packages/sim-core && node --experimental-strip-types --test tests/unit/*.test.ts tests/golden/*.test.ts
cd ../../apps/dungeon-server && npm test
```

产物：
- `scripts/playtest-core-loop.mjs` —— 独立 headless 验证台（动态 import sim-core 的 `.ts` 模块，相对本脚本解析路径）。
- `production/playtest-core-loop-report.md` —— 本报告。

---

## 6. 实现要点（供工程追溯）

- **输入序列**：固定 220-tick 脚本计划（player0=tank 朝 +x 移动 + tick0 ATTACK + tick30 DODGE + tick40/80/120/160 补 ATTACK；player1=ranger 每 tick 朝 +y 移动）。每个 `InputCmd` 带严格递增 `seq`（C11/C6），`tick` 与 `world.tick` 对齐。
- **确定性副作用**：tick36（dodge 窗口内）经 `resolveDamage` 由敌人以 `amount=999` 对 player0 施加一次攻击——既验证 C11（服务端裁决忽略 amount），又验证 O-M（i-frame 抵消）。
- **断言方式**：纯 `process.exit` + 内联判定，无第三方测试框架依赖；任一检查失败即非零退出，可直接作为 CI gate。
- **golden 回填**：首次实跑取得 `GOLDEN_PLAYTEST_HASH` 后回填脚本，二次实跑确认「三次重跑 == 锁定值」，避免循环自证。
