# E4 烟雾测试清单（最小可跑）
路径：tests/smoke/e4-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。

## 步骤 1 — sim-core 加载自检（input.ts/world.ts 导出）+ 既有 RNG 同种子一致性（沿用 e1-e3-smoke 风格）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.WorldSnapshot) throw new Error('types.ts 缺失'); console.log('types.ts OK'); });
import('./src/input.ts').then(i => { if(typeof i.PerPlayerInputQueue!=='function'||typeof i.drainForTick!=='function') throw new Error('input.ts 缺失'); console.log('input.ts OK'); });
import('./src/world.ts').then(w => { if(typeof w.createWorld!=='function') throw new Error('world.ts 缺失'); console.log('world.ts OK'); });
import('./src/rng.ts').then(r => { if(typeof r.Rng!=='function') throw new Error('rng.ts 缺失'); console.log('rng.ts OK'); });
"
node --experimental-strip-types --test tests/unit/rng.test.ts tests/unit/types.test.ts tests/unit/input.test.ts tests/golden/determinism.test.ts
# 期望：# pass 25 / # fail 0
```

## 步骤 2 — E4 确定性冒烟（world.step 同输入序列→同世界状态，确认 world.ts 迁移未破 D9）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import { createWorld } from './src/world.ts';
const opts = { runId:'r', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'A', classId:'tank' },
  { seatId:1, userId:'B', classId:'ranger' },
] };
const run = () => { const w = createWorld(opts);
  w.enqueueInput(0,{seq:1,tick:0,action:0,dir:{x:1,y:0}}); w.step();
  w.enqueueInput(0,{seq:2,tick:0,action:0,dir:{x:1,y:0}}); w.step();
  return JSON.stringify(w.snapshot().entities); };
const a = run(), b = run();
console.log('deterministic:', a===b);
if(a!==b) throw new Error('E4 world 非确定性！D9 被破坏');
"
# 也可直接跑 golden 单测（含布局锚点）确认 D9 不受影响：
node --experimental-strip-types --test tests/golden/determinism.test.ts
```

## 步骤 3 — E4 端到端最小冒烟（InputCmd 带 seq → world 应用移动 → 快照位置变化 + lastProcessedSeq 回显；seq 回放被拒）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/input-routing.test.ts
# 期望：客户端发 seq=1 向右移动 → player0 位置变化 + lastProcessedSeq[0]=1；B 不被 A 移动；
#       前向 seq=5 接受；倒序 seq=3 被 C11 拒，lastProcessedSeq[0] 维持 5
```

## 步骤 4（可选）— 既有 E1 端到端回归（确认 world.ts 迁移未破 30Hz 广播闭环）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/integration.test.ts tests/run-runtime.test.ts
# 期望：仍收到 30Hz 数据面 WorldSnapshot 帧（world.ts 迁移未破坏广播）
```

## 步骤 5（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # devDep 装好后接入 CI；当前已配 script + strict tsconfig
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 OK；步骤2 deterministic=true；步骤3 input-routing 全绿；步骤4（若跑）全绿。
- 全部满足 → E4 smoke PASS。
- C11 完整反作弊 / R1 二进制 diff / S4.2+S4.4 客户端预测插值 不在本 smoke（属 E5 / Godot 客户端，见 qa-plan-e4 §2）。
