# 核心循环 headless 可玩性验证报告（「好玩吗」验证门 · 形式化证据）

路径：`production/playtest-core-loop-report.md`
作者：程基岩（engineering-lead）｜ 状态：已落盘（用户已批准的「好玩吗」验证门证据）
对齐：Sprint 1 E1（移动/权威 tick）+ E2（双模式/持久化）+ E3（run-runtime/世界）+ E4（战斗/掉装/拾取/背包）+ E5（随机副本实例：进本/锁成员/独立域/BOSS/出本/重连订阅）
运行环境：Node v22.22.2（已用 `node --experimental-strip-types` 实跑确认，EXIT 0）
约束：**本验证台为独立工具，未修改 `apps/jianghu/sim-core/src` 与 `apps/jianghu/src` 任何运行时代码**，仅新建 `scripts/playtest-core-loop.mjs` + 本报告。无真实 ws，用 fake Conn 驱动真实 `protocol.dispatch` / `run-manager.enterInstance` / `world.step` 路径。

---

## 1. 验证门结论

> **核心循环机械闭环：成立（PASS）。**
> 在 headless（无浏览器客户端）下，E1–E5 核心循环垂直切片（加入主世界 → 移动 → 战斗 → 掉装 → 拾取 → 进副本 → 副本战斗+BOSS → 出本归位）端到端机械闭环，**12/12 检查项全部通过**，退出码 0（可作 CI gate）。

| 项 | 值 |
|---|---|
| 检查项总数 | **12**（11 功能 + 1 确定性） |
| 通过 | **12** |
| 失败 | **0** |
| 退出码 | **0**（`node --experimental-strip-types scripts/playtest-core-loop.mjs`） |
| GOLDEN_PLAYTEST_HASH | `fb383df88bd8cb85deaabc9c6c3fd6bb8b1138ab4f65a10302ef1419ce5a12f4` |
| 回归套件（未改动运行时，理论无回归，已实跑确认） | **120/120** 绿（含 `determinism.test.ts` golden `32ed5135…cc6a7b` 不变）· `npm run typecheck` 0 error |

> 说明：本验证台的确定性锚点（`GOLDEN_PLAYTEST_HASH`）是**独立于** `sim-core/tests/golden/determinism.test.ts` 的 `GOLDEN_WORLD_HASH` 的**第三条 golden**——前者锁「完整 8 步垂直切片（含实例进出/BOSS/掉落）」的确定性 journal，后者锁「12-tick 纯占位世界」；`dungeonGen.test.ts` 还锁「同 seed 布局字节级相等」。三者互不替代，共同锚定 D9。

---

## 2. 量化证据表

| 步骤 | 验证点 | 控制项 | 实测值 | 期望 / 契约 | 结论 |
|---|---|---|---|---|---|
| ① | 加入 RESIDENT | C5 / room.join | roomId=`room_resident_public`，玩家实体 @(816,720) | 任意加入、玩家入主世界 | ✅ |
| ② | 移动（MOVE dir=0） | E1 / C7 | **16.00 px/tick**（5 tick Δx=80） | `CELLS_PER_TICK(4/12)*TILE(48)=15.99…≈16` | ✅ |
| ③ | SKILL 击杀普通敌人 | E4 / C11 | 击杀 3 只；首个 hp 序列 **[10, 0]**（30→20→10→…→0） | hp 逐次扣减、hp≤0 死亡移除 | ✅ |
| ④ | 敌人死亡 → 地面掉落 | E4 / C-Per-3 | itemId=**2115625910** rarity=**2**(金) affixes=[38,16,52] ttl=**1800** | rarity∈[0,3]、affixes∈[0,5]、ttl=`LOOT_GROUND_TTL_TICKS=1800` | ✅ |
| ⑤ | 拾取：玩家重叠地面掉落 | E4 / world.consumePickups | 拾取事件 itemId=**2115625910**（与掉落一致） | `PICKUP_RADIUS` 内拾取、事件回传 | ✅ |
| ⑥ | 进副本（protocol `dungeon.enter`） | E5 / C-Dgn-1/2、C-Net-2 | 实例 roomId=`inst_*`、members=1 且锁定、连接 roomId=实例、`instSeed==computeInstanceSeed(0,1,PLAYER1)`、bossHp=300、residentTick=5 | seed 仅服务端派生；成员锁定；订阅原子切域；同步切片冻结 serverTick=0 | ✅ |
| ⑥b | 进本域隔离 | C-Net-1 | RESIDENT world 不再持有该玩家实体 | 主世界不混流副本 | ✅ |
| ⑦ | 副本战斗：击杀普通敌人 | E5 | hp 序列 **[10, 0]** | 副本内普通敌人可击杀 | ✅ |
| ⑦b | BOSS：phase 推进 + 击杀 | E5 / C11 | hp 序列 **[264,228,192,156,120,84,48,12,0]**；phase 首现 hp=**120**（<150=50% 阈值） | hp<50% → bossPhase=1（攻击节奏提升）；hp≤0 死亡 | ✅ |
| ⑦c | BOSS 必掉装 | E4 / loot | itemId=**188147203** rarity=**3**(暗金) affixes=[44,35,61,24,16] ttl=**1800** | `DROP_RATE.boss=1.0` → 金(2)/暗金(3)、affixes∈[3,5] | ✅ |
| ⑧ | 出本（protocol `dungeon.exit`） | E5 / C-Dgn-4 | 连接 roomId=RESIDENT、instAlive=false、玩家回 (768,720)=`RESPAWN_POS` | 停实例 run、实例 room 销毁、成员回主世界安全区 | ✅ |
| D9 | 确定性 | D9 | 两次运行 journal sha256 **字节级相等** 且 == 锁定 golden | 同 seed+同步输入 → 同哈希 | ✅ |

seed/party 组合：`seed="JIANGHU-S1"`、`party="PLAYER1"`、`entranceId=1`、`seatId=1`。战斗子场景用独立 sim world（`seed="JIANGHU-S1-combat"` + 8×普通刷怪区），与副本共用同一条 `world.step` 代码。

---

## 3. 覆盖的控制项（与系统映射）

| 控制项 | 含义 | 本验证台如何覆盖 |
|---|---|---|
| **E1/C7** | 权威 tick / 移动单一来源 | ② 移动严格 = `CELLS_PER_TICK*TILE`（16px/tick） |
| **E4/C11** | 服务端权威伤害 + seq 单调 | ③⑦ 全部伤害经 world.step 内 `resolveDamage`（忽略客户端 amount）；每 tick 输入带严格递增 seq（被拒则抛错） |
| **C-Per-3** | 地面掉落 TTL | ④⑦c 掉落 ttlTicks 恒 = `LOOT_GROUND_TTL_TICKS=1800` |
| **C-Dgn-1** | instanceSeed 仅服务端派生、客户端不可知 | ⑥ 实例 world.seed === `computeInstanceSeed(0,entranceId,partyTag)`（冻结 serverTick 证明）；快照不含 seed |
| **C-Dgn-2** | 成员锁定不可变 | ⑥ members=1 且 locked、`isMember(instId,PARTY)` 真 |
| **C-Dgn-3** | BOSS 可击杀 + phase 推进 | ⑦b BOSS hp 300→0，phase 首现 hp=120（<150 阈值）；BOSS 置深由 `dungeonGen.test.ts` 100 次生成 0 异常保证 |
| **C-Dgn-4** | 出本解散 / 回安全区 | ⑧ 实例 run 停止、instance room 销毁、玩家回 `RESPAWN_POS`；入口冷却 10s / 寿命 30min 由 `instance-lifecycle.test.ts` 覆盖 |
| **C-Net-1** | 实例域隔离 | ⑥b 进本后玩家实体出主世界；广播隔离由 `instance-lifecycle.test.ts` decode 帧断言 |
| **C-Net-2** | 进出本订阅原子切换 | ⑥⑧ 连接 roomId 单值原子切换（进=实例、出=RESIDENT，无中间双域） |
| **C-Net-3/C10** | 重连恢复订阅 | 真 ws 断线重连回本由 `tests/integration.test.ts` E2E C10 覆盖；本台验证正常进出本路径 |
| **D9** | 确定性 golden | 两次运行 journal sha256 字节级相等且 == 锁定 golden |

---

## 4. 明确未覆盖项（诚实列出，不夸大）

以下各项**不影响「服务端权威机械闭环成立」的结论**，但影响「主观好不好玩」的完整判定，需浏览器客户端接入后人工评估或后续 Sprint 补全：

1. **无真浏览器客户端渲染 / 插值 / 预测回正**：本台为 headless 权威模拟，不渲染、不插值、不验证客户端 reconciliation 手感；`INTERP_DELAY_MS` / `PREDICT_BUFFER` 常量已定义但未在客户端验证。
2. **无真人手感评估**：机制闭环成立 ≠ 手感好；「格挡 250ms 手感 / 技能 CD 节奏 / BOSS phase 压迫感」需真浏览器 + 真人试玩评估，headless 无法替代。
3. **无多人同本**：MVP 单人进本（`enterInstance` 已支持 `members[]`，协议层传单成员）；「集合缓冲取先到者」多人归属归 Phase-2（dungeon §⑧ 开放问题）。
4. **无真 ws 网络抖动 / RTT / 重连集成**：本台用 fake Conn + `protocol.dispatch`（无网络层）；真 ws 断线重连由 `integration.test.ts` E2E C10 覆盖，但弱网抖动 / 丢包 / RTT 下的插值回正未测。
5. **telegraph 视觉未接**：BOSS/精英前摇仅有 `TelegraphState` schema（shape/color/applyTick），DANGER 预警渲染与可读性未接入浏览器（P3 静态可读预警归美术/客户端）。
6. **敌人 AI 无自主移动 / 追击**：`world.step` 中敌人静止、仅接触攻击（攻击间隔/阶段推进已验）；追击/仇恨/走位 AI 归后续 Sprint。
7. **空间/碰撞为抽象**：战斗按 `SKILL_RANGE` 圆内命中，副本「房间」为刷怪区抽象，无实体迷宫墙/占用格碰撞（碰撞逻辑由 `movement.stepMovement` 支持但未在副本构图应用）。
8. **服务端入口坐标强校验未做**：`dungeon.enter` 由客户端踩入口触发（位置重叠判定在客户端），服务端只权威校验入口冷却 + 域边界（NOT_IN_RESIDENT）；Phase-2 可补服务端坐标校验。
9. **副本内死亡惩罚 / 背包落库未在本台覆盖**：死亡回安全区逻辑由 `world.step` 覆盖（E4 测试）；背包入库闭环由 `applyPickupToInventory` + persistence 测试覆盖。
10. **D9 哈希边界（刻意）**：实例 roomId 为服务端随机生成的**编排身份**（`generateId`，非 sim 状态），**不入确定性哈希**；以确定性指纹 `instSeed`（`computeInstanceSeed` 派生串）+ BOSS hp 序列 + 掉落哈希代表实例态。这样 roomId 随机性不污染 D9 字节级相等。

---

## 5. 如何复跑

```bash
# 前置：Node >= 22.6（已用 v22.22.2 验证），无需安装依赖
cd games/jianghu

# 运行核心循环验证台（打印 12 项检查 + GOLDEN_PLAYTEST_HASH；EXIT 0 = PASS）
node --experimental-strip-types scripts/playtest-core-loop.mjs
echo "EXIT=$?"   # 0 = 全部通过；非 0 = 存在失败项（可作 CI gate）

# 回归：既有测试套件（本工具不改运行时，理论无回归）
cd apps/jianghu && node --experimental-strip-types --test tests/*.test.ts sim-core/tests/unit/*.test.ts sim-core/tests/golden/*.test.ts
# 期望：120/120 绿，golden `32ed5135…cc6a7b` 不变
cd apps/jianghu && npm run typecheck   # 0 error
```

产物：
- `scripts/playtest-core-loop.mjs` —— 独立 headless 验证台（动态 import 真实 `.ts` 运行时，相对本脚本解析路径）。
- `production/playtest-core-loop-report.md` —— 本报告。

---

## 6. 实现要点（供工程追溯）

- **真实路径**：`room.join`/`dungeon.enter`/`dungeon.exit` 走 `protocol.dispatch`（与网关同一条分派逻辑），实例生命周期走 `run-manager.enterInstance/exitInstance`，战斗/掉装/拾取走 `world.step`（sim-core 唯一编排点）——仅用 fake Conn 替代 ws 传输。
- **确定性机制（关键）**：脚本主流程在**同步切片**内完成（动态 import 之后无任何 `await`）→ RESIDENT run loop（`setInterval` 4ms）**无法抢占同步代码** → `serverTick` 冻结为 0 → 实例 seed / 布局 / BOSS hp / 掉落全部字节级确定。脚本内以两处自证：①进副本前 `resident.world.tick===5`（手动 5 步、loop 未推进）；②实例 world.seed === `computeInstanceSeed(0,entranceId,partyTag)`。若时序前提被破坏，断言显式 FAIL（诚实，不静默）。
- **战斗隔离**：普通敌人/BOSS 在战斗前由验证台**直接挪移到独立角落**（同 dungeon-online `playtest-core-loop.mjs` 先例：`grunt.x = p0.x + 5`），玩家置于「技能范围(72px) 内、接触范围(48px) 外」的 60px 处——隔离布局距离与杂兵干扰，聚焦战斗/掉装/phase 推进逻辑本身；布局生成距离正确性由 `dungeonGen.test.ts`（界内断言 + 100 次 BOSS 置深）覆盖。
- **断言方式**：纯 `process.exit` + 内联判定，无第三方测试框架依赖；任一检查失败即非零退出。
- **golden 回填**：首次实跑（`GOLDEN_PLAYTEST_HASH=null`，仅校验两次互等）取得 `fb383df88b…5a12f4` 后回填脚本，二次实跑确认「两次运行 == 锁定值」，避免循环自证。
