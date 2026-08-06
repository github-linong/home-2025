# 快照序列化缺口闭合报告（server-side snapshot serialization gap）

路径：`production/snapshot-gap-closure.md`
作者：程基岩（engineering-lead-3）｜ 状态：Phase 5 落盘（未提交）
对齐：E8 co-op 协作技状态 + D/telegraph 可视化（qa-plan-e8.md §3(a) 注册的 co-op golden 覆盖前置）
运行环境：Node v22.22.2（`node --experimental-strip-types` 实跑确认）
纪律：本次改动 **仅 `world.snapshot()`（world.ts）+ `EntityState` 契约（types.ts）**；未触碰 `step()` / `combat.ts`；未改动 `apps/dungeon-server/src`。

---

## 1. 问题

`world.snapshot()`（world.ts）此前只序列化 `id/kind/pos/dir/hp/maxHp/status/statusEffects/ownerId`，以及仅倒地玩家的 `rescue`。
`EntityState`（types.ts）虽声明了 `telegraph?`，但 `snapshot()` 从未填充它；而 E8 协作技运行时状态
（`activeSkill` / `shieldUntilTick` / `shieldReduction` / `tauntUntilTick`）**既未在 `EntityState` 声明，也未在 `snapshot()` 填充**——
它们只存在于 world.ts 内部的 `Actor` 接口（world.ts 84–91 行），客户端（Godot `EntityView.gd`）永远拿不到，
D/telegraph 预警与 E8 HUD 提示因此一直无法渲染。

> 说明：任务简报称这些字段「已在 `EntityState`（world.ts 84–91）声明」，但实际 84–91 行是内部 `Actor` 接口，
> `EntityState`（types.ts 104–116）只声明了 `telegraph?` 与 `rescue?`。本次据此把缺失字段补进 `EntityState` 契约（见 §2）。

---

## 2. 改动（READ-ONLY 序列化，纪律 B 保持）

### 2.1 `packages/sim-core/src/world.ts` — 仅 `snapshot()`
在 `rescue` 之后，按 `rescue` 先例**仅当实体真实持有该状态才下发对应字段，否则 `undefined`**（JSON 自动丢弃 undefined 键，
故「未持有状态的实体」确定性哈希不受影响）：

| 字段 | 序列化条件 | 来源 |
|---|---|---|
| `telegraph` | `a.telegraph != null ? 转换后 TelegraphState : undefined` | 运行时 `AttackWindup` → 客户端可读 `TelegraphState` |
| `shieldUntilTick` | `a.shieldUntilTick != null && a.shieldUntilTick > world.tick` | ⑨ SHIELD_ALLY 护盾窗口仍活跃 |
| `shieldReduction` | 同上窗口条件 | ⑨ SHIELD_ALLY 减伤比例 0..1 |
| `tauntUntilTick` | `a.tauntUntilTick != null && a.tauntUntilTick > world.tick` | ⑨ TAUNT 吸引敌火窗口仍活跃 |
| `activeSkill` | `a.activeSkill ?? undefined` | 当前/最近协作技 id（E8 HUD 提示；玩家初值 `null` → 不下发） |

**`AttackWindup` → `TelegraphState` 转换**（客户端 `EntityView.gd` 据 `radius` 缩放预警图形，且 `EntityState.telegraph` 为
`TelegraphState{shape,color,startTick,applyTick,radius}`，与运行时 `AttackWindup{startTick,applyTick,targetId,kind}` 形状不同，必须转换）：
- `shape`：敌人取 `ENEMY_PROTOTYPES[enemyTypeId].shape`，玩家取 `TelegraphShape.RING`
- `color`：`DANGER_COLOR`(0)
- `startTick` / `applyTick`：直接取自 `AttackWindup`
- `radius`：敌人取 `ENEMY_PROTOTYPES[enemyTypeId].attackRange`，玩家取初稿常量 `40`（待 P5 调优）

新增导入：`TelegraphShape`、`DANGER_COLOR`（来自 types.ts）。

### 2.2 `packages/sim-core/src/types.ts` — `EntityState` 契约补全
新增四个可选字段（与 `Actor` 对齐，保证契约完整、序列化类型正确）：
```ts
readonly activeSkill?: number | null;
readonly shieldUntilTick?: number;
readonly shieldReduction?: number;
readonly tauntUntilTick?: number;
```

### 2.3 为什么无需改 dungeon-server
`run-manager.ts` 直接 `return world.snapshot()`，网关以 JSON 转发 `WorldSnapshot`。新增字段在 `EntityState` 内、
值非 undefined 时由 `JSON.stringify` 自动随实体下发 → Godot 客户端（动态字典读取）直接可见，**网络层零改动**。

---

## 3. Golden 哈希状态（关键结论：均未改变，无需 re-lock）

| 常量 | 位置 | 旧值 | 新值 | 是否 re-lock |
|---|---|---|---|---|
| `GOLDEN_WORLD_HASH` | `tests/golden/world-determinism.test.ts:26` | `67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8` | **同旧值（未变）** | ❌ 未重锁 |
| `GOLDEN_PLAYTEST_HASH` | `scripts/playtest-core-loop.mjs:47` | `889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14` | **同旧值（未变）** | ❌ 未重锁 |

**原因（实测，非假设）**：两个固定序列在快照时刻（golden = tick 26；playtest = tick 220）都没有实体持有「活跃 telegraph / 护盾 / 嘲讽」：
- golden：玩家 ATTACK 前摇 tick0 发起、tick18 结算后即清除（tick26 时玩家 telegraph=null）；敌人在 26 tick 内未逼近至攻击范围，不发动攻击 → 无 enemy telegraph。
- playtest：被锁定的 grunt 在序列中已被击倒；其余敌人未在 tick220 恰好处于活跃前摇窗口。

因此「先前为 undefined 的实体」现在仍为 undefined → JSON 字节级一致 → **哈希不变**。
这与任务简报「enemy attacks → telegraph active at snapshot → 哈希必变」的预测**相反**；以实跑结果为准。
不变是更优结果：golden 零扰动，且下方跨运行确定性检查全绿，证明本次为「正确性改进，非行为/确定性变化」。

> 为保证序列化确实生效（而非「恰好没触发」），另以独立 harness 正向验证（见 §5），确认 telegraph/E8 字段在状态持有时的确下发。

---

## 4. 测试套件结论

| 套件 | 命令 | 结果 |
|---|---|---|
| sim-core 单元测试 | `node --experimental-strip-types --test "tests/unit/*.test.ts"` | **51/51 · #fail 0** ✅ |
| sim-core golden | `node --experimental-strip-types --test "tests/golden/*.test.ts"`（2 文件） | **PASS · #fail 0** ✅（含跨运行字节相等 5× 检查） |
| dungeon-server 集成 | `cd apps/dungeon-server && npm test` | **28/28 · #fail 0** ✅ |
| 核心循环 playtest | `node scripts/playtest-core-loop.mjs` | **7/7 · exit 0** ✅（三次运行字节相等） |
| 客户端协议一致性 | `node apps/dungeon-server/tests/integration/client-protocol-conformance.mjs` | **8/8 PASS** ✅（additive，契约未改） |

### 纪律 B 静态校验（hp/status 仅经 combat/world.step）
```
grep -rnE "\.hp\s*=|status\s*=" packages/sim-core/src --include='*.ts' | grep -vE "combat\.ts|world\.ts"
```
结果：仅 `skills.ts:13` 的**注释行**（声明 discipline-B 契约本身），**零真实赋值** → 纪律 B 成立。
（另以 harness 运行期复核：`snapshot()` 前后 `actors()` 的 `hp/status` 逐实体字节相等，READ-ONLY 落实。）

---

## 5. 序列化生效正向验证（独立 harness，未提交）

临时脚本驱动「敌人处于活跃前摇」与「施放 E8 技能」两类场景，直接断言 `snapshot().entities`：

| 场景 | 断言 | 实测 |
|---|---|---|
| 敌人攻击前摇活跃 | `telegraph` 已填充且含 `shape/color/radius/startTick/applyTick` | `{"shape":1,"color":0,"startTick":0,"applyTick":24,"radius":48}` ✅ |
| SHIELD_ALLY（默认技 id=0） | `caster.activeSkill=0`；`target.shieldUntilTick>0`；`target.shieldReduction∈(0,1)` | `activeSkill:0` / `shieldUntilTick:90` / `shieldReduction:0.5` ✅ |
| TAUNT（id=2） | `caster.tauntUntilTick>0`；`caster.activeSkill=2` | `tauntUntilTick:120` / `activeSkill:2` ✅ |
| 窗口过期 | `shieldUntilTick<=world.tick` 时字段为 `undefined`（不污染哈希） | ✅ |
| 纪律 B | `snapshot()` 前后 `hp/status` 不变 | ✅ |

→ 证明客户端在真实对局（敌人前摇 / 协作技施放）中将实际收到 `telegraph` 与 E8 状态，D/telegraph 可视化与 HUD 提示的前置数据缺口已闭合。

---

## 6. 结论

- **缺口已闭合**：`world.snapshot()` 现按 `rescue` 先例条件序列化 `telegraph` + 全部 E8 协作技状态；`EntityState` 契约补全。
- **跨运行确定性 intact**：golden（5×）与 playtest（3×）字节相等检查全绿；golden 哈希零扰动（无需 re-lock）。
- **无回归**：sim-core 51/51 · dungeon-server 28/28 · playtest 7/7 · 协议一致性 8/8 全绿。
- **下一步（非本次范围）**：E8 QA 的 co-op golden 覆盖现可推进（客户端将收到技能/预警数据）；如需在确定性金色序列中固化「活跃 telegraph/E8 状态」的哈希锚点，应新增一条显式施放协作技 + 敌人前摇的 golden 序列（当前两条固定序列天然不触发）。
