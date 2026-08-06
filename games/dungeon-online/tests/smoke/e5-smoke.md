# E5 烟雾测试清单（最小可跑）
路径：tests/smoke/e5-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。
说明：E5 战斗端到端在 sim-core headless 层烟测（网关仅转发 InputCmd、schema 无 amount，故服务端权威结算可在 world 层直接验证）。

## 步骤 1 — sim-core 加载自检（combat.ts/world.ts 导出）+ 既有 RNG 同种子一致性（沿用 e4-smoke 风格）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.WorldSnapshot||!t.DamageRequest||!t.CombatIntent) throw new Error('types.ts 导出缺失'); console.log('types.ts OK'); });
import('./src/input.ts').then(i => { if(typeof i.PerPlayerInputQueue!=='function'||typeof i.drainForTick!=='function') throw new Error('input.ts 缺失'); console.log('input.ts OK'); });
import('./src/world.ts').then(w => { if(typeof w.createWorld!=='function') throw new Error('world.ts 缺失'); console.log('world.ts OK'); });
import('./src/combat.ts').then(c => { if(typeof c.resolveDamage!=='function'||typeof c.MIN_TELEGRAPH_TICKS!=='number') throw new Error('combat.ts 缺失'); console.log('combat.ts OK'); });
import('./src/rng.ts').then(r => { if(typeof r.Rng!=='function') throw new Error('rng.ts 缺失'); console.log('rng.ts OK'); });
"
node --experimental-strip-types --test tests/unit/rng.test.ts tests/unit/types.test.ts tests/unit/input.test.ts tests/unit/combat.test.ts tests/golden/determinism.test.ts tests/golden/world-determinism.test.ts
# 期望：# pass 34 / # fail 0
```

## 步骤 2 — E5 端到端最小冒烟（InputCmd 带 ATTACK 意图 → 服务端 world 经前摇后由 resolveDamage 扣目标 hp → 快照含 hp 变化；C11 伪造 amount 被服务端覆盖）
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import { createWorld } from './src/world.ts';
import { resolveDamage, CombatKind } from './src/combat.ts';
import { InputAction, PLAYER_CLASSES, EntityKind, EntityStatus } from './src/types.ts';

// (a) E5 端到端：ATTACK 意图 → ⑦ 经 ≥18 tick 前摇结算扣敌人 hp
const w = createWorld({ runId:'smoke-e5', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'P1', classId: PLAYER_CLASSES[0] },
  { seatId:1, userId:'P2', classId: PLAYER_CLASSES[1] },
]});
const enemy = w.actors().find(a=>a.kind===EntityKind.ENEMY);
const hp0 = enemy.hp;
w.enqueueInput(0,{seq:1,tick:0,action:InputAction.ATTACK,dir:{x:0,y:0},target:enemy.id});
w.step();
for(let i=0;i<20;i++){ w.enqueueInput(0,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.step(); }
const enemy2 = w.actors().find(a=>a.id===enemy.id);
console.log('E5 attack: enemy hp', hp0, '->', enemy2.hp, '| applied:', enemy2.hp < hp0);
if(!(enemy2.hp < hp0)) throw new Error('E5 ATTACK 未经理⑦结算扣血！');

// (b) C11 伪造 amount 被服务端覆盖：req.amount=9999 仍按服务端 18 裁决
const target = { id:10, hp:30, maxHp:30, status: EntityStatus.ALIVE };
const src = { id:1, hp:140, maxHp:140, status: EntityStatus.ALIVE };
const m = new Map([[10,target],[1,src]]);
const ev = resolveDamage({tick:5, entities:m}, { sourceId:1, targetId:10, amount:9999, tick:5, kind:CombatKind.ATTACK });
console.log('C11 forged amount=9999 -> hp', target.hp, 'deltaHp', ev.deltaHp);
if(target.hp !== 12 || ev.deltaHp !== -18) throw new Error('C11 伪造 amount 泄漏！');
console.log('C11 forged-amount rejected OK');
"
```

## 步骤 2b — E5 DODGE 回归（缺陷 O-M 守卫：闪避后不被冻结 + IFRAME 位过期清除）
> 对应 qa-plan-e5.md §6。设计评审发现 DODGE 冻结缺陷（world.step 输入门控严格相等 + 无 IFRAME 位清除）。
> **当前已知会失败（暴露缺陷），须在「好玩吗」门前由 engineering 修复后转绿。** 修复前作为回归守卫保留。

```bash
cd packages/sim-core
node --experimental-strip-types --input-type=module -e "
import { createWorld } from './src/world.ts';
import { InputAction, PLAYER_CLASSES, EntityStatus } from './src/types.ts';
const w = createWorld({ runId:'dodge-reg', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'P1', classId: PLAYER_CLASSES[0] },
]});
const p = () => w.actors().find(a=>a.ownerId===0);
// 闪避
w.enqueueInput(0,{seq:1,tick:0,action:InputAction.DODGE,dir:{x:0,y:0}}); w.step();
console.log('post-dodge status:', p().status, '| IFRAME set:', !!(p().status & EntityStatus.IFRAME));
// 闪避后移动 5 tick —— 期望位置变化（不被冻结）
const x0 = p().x;
for(let i=0;i<5;i++){ w.enqueueInput(0,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.step(); }
const x1 = p().x;
console.log('after 5 MOVE: x', x0, '->', x1, '| moved:', x1!==x0);
if(x1===x0) throw new Error('O-M DEFECT: 玩家闪避后永久冻结（DODGE 守卫失败）');
// IFRAME 位过期后（>12 tick）应被清除
for(let i=0;i<15;i++){ w.enqueueInput(0,{seq:7+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.step(); }
console.log('after window: status', p().status, '| IFRAME cleared:', !(p().status & EntityStatus.IFRAME));
if(p().status & EntityStatus.IFRAME) throw new Error('O-M DEFECT: IFRAME 位未在窗口过期后清除');
console.log('DODGE regression OK (O-M fixed)');
"
```

## 步骤 3 — E5 确定性冒烟（world.step 同输入序列 → 同 GOLDEN_WORLD_HASH）
```bash
cd packages/sim-core
# 主：直接跑 golden 单测（world-determinism.test.ts，3 例绿，含锁定哈希断言）
node --experimental-strip-types --test tests/golden/world-determinism.test.ts

# 备选：内联重算（注意须加 --input-type=module，否则 -e 的模块检测对本 Node 版本偶发失败）
node --experimental-strip-types --input-type=module -e "
import { createHash } from 'node:crypto';
import { createWorld } from './src/world.ts';
import { InputAction, PLAYER_CLASSES, EntityKind } from './src/types.ts';
const LOCK='823863c6b4927719b78d28f4e4de1867e4da281141191b58b303d3888017ed27';
const run=()=>{ const w=createWorld({runId:'EMBER-GOLDEN-E5',seed:'EMBER-S1',biomeId:0,players:[{seatId:0,userId:'P1',classId:PLAYER_CLASSES[0]},{seatId:1,userId:'P2',classId:PLAYER_CLASSES[1]}]});
 const eid=w.actors().find(a=>a.kind===EntityKind.ENEMY).id;
 w.enqueueInput(0,{seq:1,tick:0,action:InputAction.ATTACK,dir:{x:0,y:0},target:eid}); w.step();
 for(let i=0;i<25;i++){ w.enqueueInput(0,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.enqueueInput(1,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:0,y:1}}); w.step(); }
 return createHash('sha256').update(JSON.stringify(w.snapshot().entities)).digest('hex'); };
const a=run(),b=run();
console.log('deterministic:',a===b,'matches golden:',a===LOCK);
if(a!==b||a!==LOCK) throw new Error('E5 world 非确定性或 golden 失配！D9 破');
"
```

## 步骤 4（可选）— 既有回归（确认 world.ts 战斗接管未破 E4/E1 闭环：seq 防重放 + 30Hz 广播）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/input-routing.test.ts tests/integration.test.ts tests/run-runtime.test.ts
# 期望：input-routing 全绿（seq 防重放维持）；integration 收到 30Hz 数据面 WorldSnapshot 帧
```

## 步骤 5（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # 本仓未装 typescript，devDep 装好后接入 CI；当前已配 script + strict tsconfig
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 types/input/world/combat/rng OK；步骤1 末行测试 # pass 34 / # fail 0。
- 步骤2 打印 `E5 attack: ... applied: true` 且 `C11 forged-amount rejected OK`。
- 步骤2b（O-M DODGE 守卫）：**修复前已知失败（暴露缺陷），修复后须打印 `DODGE regression OK (O-M fixed)`**（位置变化 + IFRAME 位清除）。该步骤在 O-M 闭环前标记为 must-fix 守卫，不计入「合入门」green。
- 步骤3 world-determinism.test.ts 全绿（或内联重算 deterministic=true 且 matches golden=true）。
- 步骤4（若跑）全绿。
- 合入门 smoke PASS 判据：步骤1/2/3 全绿 + 步骤4（若跑）全绿（步骤2b 作为已知缺陷守卫，待 O-M 修复后转绿）。
- 「好玩吗」门前须额外闭环：步骤2b 转绿（O-M DODGE 冻结修复）。
- ⑧ 敌人 AI / ⑪ 救援倒地 / R1 二进制 diff / S4.2+S4.4 客户端预测插值 / telegraph 视觉渲染 / SKILL 差异化 / 碰撞检测 不在本 smoke（属 E6/E7/Godot 客户端，见 qa-plan-e5 §2）。
