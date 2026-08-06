# 《余烬小队》测试框架规划 · Phase 4 预制作

**路径**：`games/dungeon-online/production/test-framework.md`
**作者**：程基岩（engineering-lead）
**状态**：草稿经用户批准落盘（Sprint 1）；脚手架实际代码待冲刺计划批准后再建
**对齐**：control-checklist C5 / C7 / C10 / C11；ADR-ENG-02 / ADR-ENG-03。

## 1. 测试策略（四层 + 安全）
1. **sim-core 单元测试**（unit）：纯函数确定性，覆盖 rng / dungeon-gen / combat / enemy-ai / rescue / types。零依赖、秒级、CI 必跑。
2. **确定性 golden-test**（golden，对应 C7/D9）：同 seed + 同输入序列 → 同布局 + 同 N-tick 世界哈希；TS 权威实现与 GDScript 端口用同一向量对齐，防跨语言 sim 分歧。
3. **重连无跳变集成测试**（integration，对应 C10）：模拟断线→抓拍 PersonalState→重连→断言状态=掉线瞬间（含 DOWNED 剩余窗口），room 态=当前，无跳变、无 OUT 误判。
4. **30Hz×4 人性能压测**（perf，对应 C5）：状态 diff 序列化吞吐 + 广播延迟 + 单客户端带宽；验证 30Hz×4 在 Web 预算内。
5. **反作弊/安全测试**（security，对应 C11）：服务器拒绝篡改输入（seq 重放、越界伤害请求、客户端伪造状态）——归入 integration/security。

## 2. 目录结构草案
```
games/dungeon-online/
├── packages/
│   └── sim-core/                 # 引擎无关确定性 TS 核心（ADR-ENG-02 缓解项）
│       ├── src/
│       │   ├── types.ts          # EntityState / WorldSnapshot / SpawnPoint / InputCmd / PersonalState
│       │   ├── rng.ts            # splitmix64 / Xoshiro（D9）
│       │   ├── dungeon-gen.ts    # seed → LayoutSnapshot + SpawnPoint[]（D10，纪律A）
│       │   ├── combat.ts         # 伤害/状态结算核心（D13）
│       │   ├── enemy-ai.ts       # 行为 + 伤害请求 + telegraph（纪律B）
│       │   └── rescue.ts         # DOWNED/救援/托管计时（D8）
│       └── tests/
│           ├── unit/             # 纯函数单测
│           └── golden/           # 确定性向量（C7）
├── apps/
│   └── dungeon-server/           # Node 权威服务器（复用 poker 骨架）
│       ├── src/
│       │   ├── gateway.ts        # ws + auth + 二进制 diff 通道（C5）
│       │   ├── room-service.ts   # 房间/RESIDENT/重连（C4/C10）
│       │   ├── run-runtime.ts    # 30Hz tick 主循环（C6）
│       │   └── connection-registry.ts
│       └── tests/
│           ├── integration/      # 重连无跳变（C10）/ tick 管线 / 安全（C11）
│           └── perf/             # 30Hz×4 压测（C5）
└── tests/                        # 统一入口（可选汇总）
```
运行器：复用仓库 `node --test`（现有 apps 同款）；sim-core 用 `tsx` 加载 TS，或编译后跑。CI：unit+golden 每次必跑；integration 每次必跑；perf 设阈值门禁（如 diff 序列化 < 2ms/tick @ 40 实体）。

## 3. 最小示例测试（示意，非全量实现）
### 3.1 单元测试（sim-core combat）
```ts
// packages/sim-core/tests/unit/combat.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyDamageRequest, makeEntity } from "../src/combat.ts";

test("damage reduces hp and respects i-frame", () => {
  const e = makeEntity({ hp: 100, iframeTicks: 0 });
  const after = applyDamageRequest(e, { source: 1, target: e.id, amount: 20, type: 0, applicationTick: 5 });
  assert.equal(after.hp, 80);                       // 伤害生效
  const inv = makeEntity({ hp: 100, iframeTicks: 3 });
  const afterIf = applyDamageRequest(inv, { source: 1, target: inv.id, amount: 20, type: 0, applicationTick: 5 });
  assert.equal(afterIf.hp, 100);                    // i-frame 免疫
});
```

### 3.2 确定性 golden-test（C7 / D9）
```ts
// packages/sim-core/tests/golden/determinism.test.ts
test("same seed + same inputs => identical layout + world hash", () => {
  const seed = 0x1234_5678n;
  const a = simulate(seed, FIXED_INPUTS, 1000);     // TS 权威
  const b = simulate(seed, FIXED_INPUTS, 1000);
  assert.equal(a.layoutHash, GOLDEN_LAYOUT_HASH);   // 对齐设计期锁定向量
  assert.equal(a.worldHash, b.worldHash);           // 同 seed 必同结果
  // GDScript 端口须在引擎侧产出相同 GOLDEN_LAYOUT_HASH（跨语言对齐）
});
```

### 3.3 重连无跳变集成测试（C10 / D8）
```ts
// apps/dungeon-server/tests/integration/reconnect-no-jump.test.ts
test("disconnect mid-DOWNED restores exact remaining window, no OUT", async () => {
  const { server, clientA } = await startRun(2);
  await downPlayer(clientA);                         // A 进入 DOWNED，剩余窗口 18 ticks
  const snapshotBefore = await server.capturePersonalState(clientA.seat);
  await clientA.dropConnection();                    // 断线 → 托管（计时暂停）
  await tick(server, 50);                            // 房继续，A 计时冻结
  const clientA2 = await reconnect(server, clientA.token);
  const stateAfter = await clientA2.getOwnState();
  assert.equal(stateAfter.status, "DOWNED");
  assert.equal(stateAfter.downedRemainingTicks, snapshotBefore.downedRemainingTicks); // 含剩余窗口，无跳变
  assert.notEqual(stateAfter.status, "OUT");         // 未误判超时
  const roomNow = await clientA2.getRoomState();
  assert.ok(roomNow.tick > snapshotBefore.tick);     // room 态为当前（他人已动）
});
```

### 3.4 性能压测（C5 / D5）
```ts
// apps/dungeon-server/tests/perf/state-diff-30hz.test.ts
test("state-diff serialization @30Hz x4 clients stays within budget", () => {
  const run = makeRun({ clients: 4, entities: 40 });
  const samples = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    const buf = run.serializeTickDiff();             // 二进制 delta（ADR-ENG-03 §B）
    samples.push(performance.now() - t0);
    run.advanceTick();
  }
  const p95 = percentile(samples, 95);
  assert.ok(p95 < 2.0, `serialize p95=${p95}ms must < 2ms`);
  assert.ok(buf.bytesPerClient(4) < 16_000, "bandwidth/client < 16KB/s"); // 估 12KB/s 留余量
});
```

### 3.5 反作弊/安全测试（C11）
```ts
// apps/dungeon-server/tests/integration/security.test.ts
test("server rejects replayed/out-of-seq input and forged damage", async () => {
  const { server, client } = await startRun(1);
  await client.sendInput({ seq: 5, tick: 10 });      // 正常
  const replay = await client.sendInput({ seq: 5, tick: 10 }); // 同 seq 重放
  assert.equal(replay.accepted, false);              // seq 防重放
  const forged = await client.submitDamageRequest({ amount: 9999, source: client.seat });
  assert.equal(forged.accepted, false);              // 客户端不为真相源，伤害请求须经 ⑧→⑦
});
```

## 4. 与 control-checklist 对齐
- C5 ← §3.4 perf（30Hz×4 二进制 diff 预算）。
- C7 ← §3.2 golden（确定性 seed→布局/状态向量）。
- C10 ← §3.3 integration（重连无跳变，含 DOWNED 剩余窗口）。
- C11 ← §3.5 security（服务器权威 + seq 防重放 + 拒绝伪造）。
- C6（纪律 A/B）← 在 sim-core 加依赖方向测试：enemy-ai 不 import combat/dungeon-gen 运行时（import 仅类型）。

## 5. 备注
- 本次仅出规划与目录结构；`packages/sim-core/`、`apps/dungeon-server/` 及全部 test 文件待冲刺计划批准后再建。
- 与 design-strategist 协作：C9（D3 回填）完成前，golden 向量中的 telegraph 前摇须用锁定值 0.6s（18 tick）。
