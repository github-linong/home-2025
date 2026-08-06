# E6 烟雾测试清单（最小可跑）
路径：tests/smoke/e6-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。
说明：E6 敌人 AI 端到端在 sim-core headless 层烟测（网关仅转发 InputCmd、schema 无 amount，故敌人伤害可经 world 层直接验证）；确定性由 GOLDEN_WORLD_HASH 双 golden 守门。

## 步骤 1 — sim-core 加载自检（enemy-ai.ts/world.ts/combat.ts/types.ts 导出）+ 全量 # fail 0
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.WorldSnapshot||!t.DamageRequest||!t.CombatIntent||!t.ENEMY_PROTOTYPES) throw new Error('types.ts 导出缺失'); console.log('types.ts OK'); });
import('./src/input.ts').then(i => { if(typeof i.PerPlayerInputQueue!=='function'||typeof i.drainForTick!=='function') throw new Error('input.ts 缺失'); console.log('input.ts OK'); });
import('./src/world.ts').then(w => { if(typeof w.createWorld!=='function') throw new Error('world.ts 缺失'); console.log('world.ts OK'); });
import('./src/combat.ts').then(c => { if(typeof c.resolveDamage!=='function'||typeof c.MIN_TELEGRAPH_TICKS!=='number') throw new Error('combat.ts 缺失'); console.log('combat.ts OK'); });
import('./src/enemy-ai.ts').then(a => { if(typeof a.stepEnemyAi!=='function') throw new Error('enemy-ai.ts 缺失'); console.log('enemy-ai.ts OK'); });
import('./src/rng.ts').then(r => { if(typeof r.Rng!=='function') throw new Error('rng.ts 缺失'); console.log('rng.ts OK'); });
"
node --experimental-strip-types --test tests/unit/rng.test.ts tests/unit/types.test.ts tests/unit/input.test.ts tests/unit/combat.test.ts tests/unit/enemy-ai.test.ts tests/unit/world-dodge.test.ts tests/golden/determinism.test.ts tests/golden/world-determinism.test.ts
# 期望：# tests 45 / # pass 45 / # fail 0
```

## 步骤 2 — E6 端到端最小冒烟（敌人经 tier telegraph 后使玩家掉血 + 敌人伤害取原型值≠18）
```bash
cd packages/sim-core
node --experimental-strip-types --input-type=module -e "
import { createWorld } from './src/world.ts';
import { EntityKind, EntityStatus } from './src/types.ts';

// 1 名 tank 玩家世界（seed=EMBER-S1 产出 grunt_swarm，与 playtest 台一致）。
const w = createWorld({ runId:'smoke-e6', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'P1', classId:'tank' },
]});
const player = w.actors().find(a => a.ownerId === 0);
const enemy = w.actors().find(a => a.kind === EntityKind.ENEMY && a.enemyTypeId === 'grunt_swarm');
// actors() 返回活引用 → 直接搬迁敌人到玩家身旁、进入攻击范围（与 enemy-ai.test.ts 同手法）。
enemy.x = player.x + 5; enemy.y = player.y;
const hp0 = player.hp;
const protoDmg = (await import('./src/types.ts')).ENEMY_PROTOTYPES.grunt_swarm.attackDamage; // 8

for(let i=0;i<30;i++) w.step();  // grunt telegraphTicks=21，30 tick 足够前摇完成并结算一次。
console.log('E6 enemy AI: player hp', hp0, '->', player.hp, '| delta', hp0-player.hp);
if(!(player.hp < hp0)) throw new Error('E6 敌人 AI 未经理 telegraph→resolveDamage 使玩家掉血！');
if((hp0 - player.hp) !== protoDmg) throw new Error('E6 敌人伤害应取原型值('+protoDmg+')，而非玩家 18');
if((hp0 - player.hp) === 18) throw new Error('E6 敌我伤害分离破：敌人伤害不应等于玩家 18');
console.log('E6 enemy AI OK (damage='+protoDmg+', prototype value, not 18)');
"
```

## 步骤 2b — O-M DODGE 回归（E6 world.ts 重写已闭环：DODGE 后不冻结 + IFRAME 位过期清除）
> 对应 design-review-e5 §6 高优缺陷；本 Phase world.ts 已修复（位运算门控 + 过期清 IFRAME 位）+ world-dodge.test.ts 5 例回归。**当前应 PASS（非缺陷守卫）**。
```bash
cd packages/sim-core
node --experimental-strip-types --input-type=module -e "
import { createWorld } from './src/world.ts';
import { InputAction, PLAYER_CLASSES, EntityStatus } from './src/types.ts';
const w = createWorld({ runId:'dodge-reg-e6', seed:'O-M-SEED', biomeId:0, players:[
  { seatId:0, userId:'P1', classId: PLAYER_CLASSES[0] },
]});
const p = () => w.actors()[0];
w.enqueueInput(0,{seq:1,tick:0,action:InputAction.DODGE,dir:{x:0,y:0}}); w.step();
console.log('post-dodge status:', p().status, '| IFRAME set:', !!(p().status & EntityStatus.IFRAME));
const x0 = p().x;
for(let i=0;i<5;i++){ w.enqueueInput(0,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.step(); }
const x1 = p().x;
console.log('after 5 MOVE: x', x0, '->', x1, '| moved:', x1!==x0);
if(x1===x0) throw new Error('O-M DEFECT: 玩家闪避后永久冻结');
for(let i=0;i<15;i++){ w.enqueueInput(0,{seq:7+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.step(); }
console.log('after window: status', p().status, '| IFRAME cleared:', !(p().status & EntityStatus.IFRAME));
if(p().status & EntityStatus.IFRAME) throw new Error('O-M DEFECT: IFRAME 位未在窗口过期后清除');
console.log('DODGE regression OK (O-M fixed in E6)');
"
```

## 步骤 3 — E6 确定性冒烟（world.step 同 seed+输入 → 同 GOLDEN_WORLD_HASH）
```bash
cd packages/sim-core
# 主：直接跑 golden 单测（world-determinism.test.ts，3 例绿，含锁定哈希断言）。
node --experimental-strip-types --test tests/golden/world-determinism.test.ts

# 备选：内联重算（注意须加 --input-type=module）。
node --experimental-strip-types --input-type=module -e "
import { createHash } from 'node:crypto';
import { createWorld } from './src/world.ts';
import { InputAction, PLAYER_CLASSES, EntityKind } from './src/types.ts';
const LOCK='67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8';
const run=()=>{ const w=createWorld({runId:'EMBER-GOLDEN-E6',seed:'EMBER-S1',biomeId:0,players:[
  {seatId:0,userId:'P1',classId:PLAYER_CLASSES[0]},{seatId:1,userId:'P2',classId:PLAYER_CLASSES[1]}]});
 const eid=w.actors().find(a=>a.kind===EntityKind.ENEMY).id;
 w.enqueueInput(0,{seq:1,tick:0,action:InputAction.ATTACK,dir:{x:0,y:0},target:eid}); w.step();
 for(let i=0;i<25;i++){ w.enqueueInput(0,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:1,y:0}}); w.enqueueInput(1,{seq:2+i,tick:0,action:InputAction.MOVE,dir:{x:0,y:1}}); w.step(); }
 return createHash('sha256').update(JSON.stringify(w.snapshot().entities)).digest('hex'); };
const a=run(),b=run();
console.log('deterministic:',a===b,'matches golden:',a===LOCK);
if(a!==b||a!==LOCK) throw new Error('E6 world 非确定性或 golden 失配！D9 破');
"
```

## 步骤 4（建议）— 既有回归（确认 world.ts 敌人接管未破 E1/E4 闭环：seq 防重放 + 30Hz 广播）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/input-routing.test.ts tests/integration.test.ts tests/run-runtime.test.ts
# 期望：input-routing 全绿（seq 防重放维持）；integration 收到 30Hz 数据面 WorldSnapshot 帧
```

## 步骤 5（建议）— 核心循环 playtest 验证门（含 O-E / D12 / O-M / C11 / D9 七项）
```bash
cd /Users/lnmacmini/Projects/personal-site/games/dungeon-online
node scripts/playtest-core-loop.mjs
# 期望：检查项 7 / 通过 7 / 失败 0 / 确定性 hash=889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14 / EXIT 0
```

## 步骤 6（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # 本仓未装 typescript，devDep 装好后接入 CI；当前已配 script + strict tsconfig
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 types/input/world/combat/enemy-ai/rng OK；末行测试 # tests 45 / # pass 45 / # fail 0。
- 步骤2 打印 `E6 enemy AI OK (damage=8, prototype value, not 18)`（玩家掉血且伤害=原型 8≠18）。
- 步骤2b（O-M DODGE 守卫）：打印 `DODGE regression OK (O-M fixed in E6)`（位置变化 + IFRAME 位清除）——**本 Phase 已闭环，须 PASS**（不再是已知失败守卫）。
- 步骤3 world-determinism.test.ts 全绿（或内联重算 deterministic=true 且 matches golden=true）。
- 步骤4（若跑）全绿。
- 步骤5（若跑）打印 `检查项：7 通过：7 失败：0` 且 EXITCODE=0。
- **合入门 smoke PASS 判据**：步骤1/2/3 全绿 + 步骤2b 全绿（O-M 已闭环）+ 步骤4/5（若跑）全绿。
- 明确**不**在本 smoke 的项（属 E7/E12/Godot 客户端，见 qa-plan-e6 §2 defer）：telegraph 视觉渲染、敌人 AI 高阶行为（技能/走位/编队）、平衡初稿调优、R1 二进制 diff、S4.2+S4.4 客户端预测插值、攻击距离重校验（O-C 继承）。
