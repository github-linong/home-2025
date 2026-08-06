# E2 数据基座 · QA 计划
路径：production/qa-plan-e2.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Sprint 1）
对齐：test-framework.md 四层 + control-checklist C6/C7/C11；epics E2(S2.1–S2.4)
运行环境：Node 22.6+（已用 v22.22.2 验证）

## 1. E2 测试策略（四层映射）
E2 范围 = S2.1 统一状态/属性模型 + S2.2 敌人原型表 + S2.3 资源原型表 + S2.4 确定性 RNG。
本 Epic 只定义 schema 与确定性 RNG，写入逻辑在 E5/E6/E7，故 E2 测试以「unit + 静态」为主。

### 1.1 确定性 RNG 单测（unit，对应 S2.4 / C6 纪律A 数据边界 / C7）
- 断言：同 seed → 同序列。splitmix64 / xoshiro256+ / Rng 封装各验 1000 tick 逐值相等。
- 断言：不同 seed 必分歧（sanity）。
- 断言：Rng.nextInt 闭区间边界；Rng 无全局态（独立实例同 seed 产出完全一致序列）。
- golden 锚点：seed=0 首值锁定为 splitmix64=0xe220a8397b1dcdaf / xoshiro256+=0xdaac60e1ed6a4f9b，
  供 GDScript 端口跨语言对齐（C7）。锚点值已用独立参考实现交叉验证。
- 当前状态：8/8 绿（tests/unit/rng.test.ts + tests/golden/determinism.test.ts）。

### 1.2 类型/原型表 schema 校验（unit，对应 S2.1–S2.3）★ tests/unit/types.test.ts 已补（C-B 关闭）
- 断言 EntityStatus 恰为 8 个标志位、值 = 1<<0..1<<7（8-bit bitmask 契约）。
- 断言 PLAYER_CLASSES 长度=4、CLASS_BASE 覆盖全职业、hp/moveSpeed/attackCooldownMs 为正。
- 断言 FACTION_COLORS 4 键齐备且为色盲安全十六进制。
- 断言 ENEMY_PROTOTYPES 每个 telegraphTicks >= 18（C8 MIN_TELEGRAPH_TICKS=18 下限，当前 21/24/30 满足）。
- 断言 RESOURCE_PROTOTYPES 字段完整（category/magnitude/durationTicks）。
- 断言 InputCmd 含 seq（C11 防重放字段），TelegraphState.applyTick 由服务器裁定（只读 schema）。
- 说明：types.ts 仅含类型别名/接口/const 数据、无运行时逻辑（纪律），上述校验为纯数据不变量。
- 当前状态：已建 tests/unit/types.test.ts，随 `npm test` 全量跑。

### 1.3 纪律 A/B 静态检查（static，对应 C6）
- 纪律 A（数据边界）：⑤ dungeon-gen 与 ⑧ enemy-ai 单向，⑧ 只读 SpawnPoint[] 实例、不调生成函数。
  静态断言：enemy-ai.ts / dungeon-gen.ts 不互相 import 运行时。
- 纪律 B：enemy-ai 不 import combat/dungeon-gen 运行时；仅 `import type`。
  静态断言：sim-core/src 下所有跨模块 import 均为 `import type`（已 grep 全量确认通过）。
- 落地方式：CI 加 grep/依赖方向检查脚本（或 eslint import/type 规则）；E2 阶段已手工核验。

### 1.4 C7 golden 契约对齐（对应 D9）
- E2 锁定层级：golden 契约锁在 RNG 层（已通过 1.1 锚点）。
- 待填：同 seed + 同输入序列 → 同 LayoutSnapshot.hash（E3.S3.4）/ 同 WorldSnapshot.hash（E5）。
  当前 tests/golden/determinism.test.ts 为占位（GOLDEN_LAYOUT_HASH="PENDING_E3"、GOLDEN_WORLD_HASH="PENDING_E5"），
  属设计预期，非缺陷。GDScript 端口须产出相同锚点值以跨语言对齐。
- 约束（test-framework §5）：design-strategist 完成 C9（D3 回填）前，telegraph 前摇锁 0.6s(18 tick)。

## 2. 归属矩阵：unit vs 后续 integration（明确 E2 边界）
| 检查项 | 归属层 | 本 E2 是否覆盖 | 备注 |
|---|---|---|---|
| RNG 同 seed 同序列 + golden 锚点 | unit | ✅ 已覆盖 | S2.4 / C7 |
| 原型表 schema 不变量 | unit | ✅ 已补（C-B） | S2.1–S2.3 |
| 纪律 A/B 静态检查 | static | ✅ 已核验 | C6 |
| C7 布局/世界哈希 golden | golden(integration) | ❌ 不在 E2 | 属 E3.S3.4 / E5 |
| C10 重连无跳变 | integration | ❌ 不在 E2 | 属 E1 + E7（S1.6 / S7.7） |
| C5 30Hz×4 perf | perf | ❌ 不在 E2 | 属 E1.S1.2 |
| C11 反作弊/seq 防重放 | integration/security | ❌ 不在 E2 | 属 E5.S5.7 |

## 3. 测试分层与命令
- unit：`node --experimental-strip-types --test tests/unit/*.test.ts`
- golden：`node --experimental-strip-types --test tests/golden/*.test.ts`
- 全量：`npm test`（= unit + golden）
- 类型门（建议，C-A）：`npx tsc --noEmit`（已配 script + strict tsconfig；devDep 待装，跑通前不阻塞）

## 4. E2 质量门判定
- 判定：**PASS**（无阻塞项）。
- CONCERNS（非阻塞）：C-A 无类型检查门（脚本已配，待装包）；C-B 已建 types.test.ts 关闭。
- 放行建议：E2 脚手架 + 数据基座进入 E1。

## 5. 后续 Sprint 衔接 TODO
- E3.S3.4：将 determinism.test.ts 占位升级为真实布局 golden（同 seed→同 LayoutSnapshot.hash）。
- E5：补 WorldSnapshot 世界哈希 golden 与战斗管线确定性。
- 全程：GDScript 端口对齐 1.1 锚点值，保 C7 跨语言一致。
