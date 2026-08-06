# E1/E3 烟雾测试清单（最小可跑）
路径：tests/smoke/e1-e3-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。

## 步骤 1 — sim-core 加载自检 + RNG 同种子一致性（沿用 e2-smoke 风格）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.PLAYER_CLASSES||!t.ENEMY_PROTOTYPES) throw new Error('types.ts 导出缺失'); console.log('types.ts OK'); });
import('./src/rng.ts').then(r => { if(typeof r.Rng!=='function') throw new Error('rng.ts 缺失'); console.log('rng.ts OK'); });
import('./src/dungeon-gen.ts').then(d => { if(typeof d.generateLayout!=='function') throw new Error('dungeon-gen 缺失'); console.log('dungeon-gen OK'); });
"
node --experimental-strip-types --test tests/unit/rng.test.ts tests/unit/types.test.ts tests/golden/determinism.test.ts
# 期望：# pass 18 / # fail 0
```

## 步骤 2 — E3 确定性冒烟（同 seed+biome 两次生成 LayoutSnapshot hash 相等）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import { generateLayout } from './src/dungeon-gen.ts';
import { createHash } from 'node:crypto';
const h = (s,b)=>createHash('sha256').update(JSON.stringify(generateLayout(s,b))).digest('hex');
const a = h('EMBER-S1',0), b = h('EMBER-S1',0);
console.log('hash1', a);
console.log('hash2', b);
console.log('deterministic:', a===b);
console.log('golden match:', a==='bf4893ba35b9e85bfd1ec6e8542480e97be8bd87f7bbbebf4a01b4335bf296c4');
if(a!==b) throw new Error('E3 非确定性！');
"
# 也可直接跑 golden 单测（含锚点断言）：
node --experimental-strip-types --test tests/golden/determinism.test.ts
```

## 步骤 3 — E1 端到端最小冒烟（room.create → join → game.start → 收到 30Hz WorldSnapshot）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/integration.test.ts tests/run-runtime.test.ts
# 期望：
#  - integration 用例断言「client B 收到 30Hz 数据面 WorldSnapshot 帧」（tick 字段 + entities 存在）
#  - run-runtime 用例断言真实 30Hz 循环推进 tick 且每 tick 广播一次快照
# 注：数据面当前为 JSON→Buffer（R1 占位），非二进制 delta；断言仅校验帧结构与 tick。
```

## 步骤 4（可选，C10 握手冒烟）— 重连合法/非法 token
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/protocol.test.ts
# 期望：session.reconnect 合法 token 返回 ok + 拉全量快照；非法 token 返回 RECONNECT_EXPIRED
```

## 步骤 5（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # devDep 装好后接入 CI；当前已配 script + strict tsconfig
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 OK；步骤2 deterministic=true 且 golden match=true；步骤3 integration + run-runtime 全绿；步骤4（若跑）全绿。
- 全部满足 → E1/E3 smoke PASS。
- C5 perf / C11 安全 / C10 深度不跳变 不在本 smoke（属 E5/E7，见 qa-plan-e1-e3 §1.4 / §2）。
