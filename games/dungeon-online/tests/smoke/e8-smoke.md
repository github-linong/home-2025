# E8 烟雾测试清单（最小可跑）
路径：tests/smoke/e8-smoke.md ｜ 作者：严守真（quality-lead-1）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。
说明：E8 协作技（系统⑨，闭合 O-A）在 sim-core headless 层单测 + 端到端验证；确定性由 GOLDEN_WORLD_HASH / GOLDEN_PLAYTEST_HASH 双 golden 守门；纪律 B 由全局静态 grep 守门。E8 不引入 dungeon-server 改动，仅验证其零回归。

## 步骤 1 — sim-core 加载自检（types/world/combat/enemy-ai/skills/rescue/input 导出）+ 全量 unit # fail 0
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.SKILL_PROTOTYPES||!t.SKILL_IDS||!t.SkillTargetMode||!t.getSkillPrototype) throw new Error('types.ts 导出缺失'); console.log('types.ts OK'); });
import('./src/skills.ts').then(s => { if(typeof s.resolveSkillApplication!=='function') throw new Error('skills.ts 缺失'); console.log('skills.ts OK'); });
import('./src/world.ts').then(w => { if(typeof w.createWorld!=='function') throw new Error('world.ts 缺失'); console.log('world.ts OK'); });
import('./src/combat.ts').then(c => { if(typeof c.resolveDamage!=='function'||typeof c.MIN_TELEGRAPH_TICKS!=='number') throw new Error('combat.ts 缺失'); console.log('combat.ts OK'); });
import('./src/enemy-ai.ts').then(a => { if(typeof a.stepEnemyAi!=='function') throw new Error('enemy-ai.ts 缺失'); console.log('enemy-ai.ts OK'); });
import('./src/rescue.ts').then(r => { if(typeof r.rescueCandidates!=='function') throw new Error('rescue.ts 缺失'); console.log('rescue.ts OK'); });
import('./src/input.ts').then(i => { if(typeof i.PerPlayerInputQueue!=='function') throw new Error('input.ts 缺失'); console.log('input.ts OK'); });
"
node --experimental-strip-types --test "tests/unit/*.test.ts"
# 期望：# tests 51 / # pass 51 / # fail 0（含 coop-skill.test.ts 新增 8 例）
```

## 步骤 2 — E8 协作技端到端最小冒烟（SHIELD 减伤 / REVIVE 加速救援 / TAUNT 改敌火 + 冷却强控）
```bash
cd packages/sim-core
node --experimental-strip-types --input-type=module -e "
import { createWorld } from './src/world.ts';
import { resolveDamage, CombatKind, PLAYER_ATTACK_DAMAGE } from './src/combat.ts';
import { InputAction, EntityStatus, SKILL_IDS } from './src/types.ts';

// 3 名玩家世界（seed=EMBER-S1，与 playtest 台一致）。
const w = createWorld({ runId:'smoke-e8', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'P1', classId:'tank' },
  { seatId:1, userId:'P2', classId:'ranger' },
  { seatId:2, userId:'P3', classId:'mage' },
]});
const bySeat = s => w.actors().find(a => a.ownerId === s);
const p0 = bySeat(0), p1 = bySeat(1), p2 = bySeat(2);

// (A) SHIELD_ALLY：给 p1 护盾 → 减伤 50%。
w.enqueueInput(0,{seq:1,tick:0,action:InputAction.SKILL,dir:{x:0,y:0},target:p1.id,param:SKILL_IDS.SHIELD_ALLY}); w.step();
if(!(p1.shieldUntilTick>0)) throw new Error('E8 SHIELD: 未落地护盾窗口');
if(p1.shieldReduction!==0.5) throw new Error('E8 SHIELD: 减伤比例≠0.5');
if(p0.cooldownUntilTick!==360) throw new Error('E8 SHIELD: 冷却未设 360');
const combatMap = new Map(w.actors().map(a=>[a.id,a]));
const hpBefore = p1.hp;
resolveDamage({tick:w.tick, entities:combatMap}, {sourceId:p0.id, targetId:p1.id, amount:0, tick:w.tick, kind:CombatKind.ATTACK});
const dropped = hpBefore - p1.hp;
if(dropped !== Math.round(PLAYER_ATTACK_DAMAGE*(1-0.5))) throw new Error('E8 SHIELD: 减伤未 = 9 (got '+dropped+')');
console.log('E8 SHIELD_ALLY OK (reduction=9, cooldown=360)');

// (B) REVIVE_BOOST：击倒 p2 → 急救链 +45tick 救援读条。
p2.hp=0; p2.status = EntityStatus.ALIVE | EntityStatus.DOWNED; p2.downedTicks=0; p2.rescueTicks=0;
const rb = p2.rescueTicks;
w.enqueueInput(0,{seq:2,tick:1,action:InputAction.SKILL,dir:{x:0,y:0},target:p2.id,param:SKILL_IDS.REVIVE_BOOST}); w.step();
if(p2.rescueTicks !== rb+45) throw new Error('E8 REVIVE: 救援读条未 +45 (got '+p2.rescueTicks+')');
if(p0.cooldownUntilTick!==300) throw new Error('E8 REVIVE: 冷却未设 300');
console.log('E8 REVIVE_BOOST OK (rescueTicks+45, cooldown=300)');

// (C) TAUNT：p0 嘲讽 → 吸引敌火（敌人 AI 改锁 p0）。
const enemy = w.actors().find(a => a.kind===1);
p0.x=1024; p0.y=640; p1.x=1054; p1.y=640; enemy.x=1074; enemy.y=640;
w.enqueueInput(0,{seq:3,tick:2,action:InputAction.SKILL,dir:{x:0,y:0},param:SKILL_IDS.TAUNT}); w.step();
if(!(p0.tauntUntilTick>0)) throw new Error('E8 TAUNT: 未落地嘲讽窗口');
let tid=null;
for(let i=0;i<15 && tid===null;i++){ w.step(); const e=w.actors().find(a=>a.id===enemy.id); if(e.telegraph) tid=e.telegraph.targetId; }
if(tid!==p0.id) throw new Error('E8 TAUNT: 敌人未改锁嘲讽者 (got '+tid+')');
console.log('E8 TAUNT OK (enemy retargets to taunter, cooldown=420)');
"
```

## 步骤 3 — E8 确定性冒烟（golden 8/8：GOLDEN_WORLD_HASH + GOLDEN_PLAYTEST_HASH 双 golden）
```bash
cd packages/sim-core
node --experimental-strip-types --test "tests/golden/*.test.ts"
# 期望：# tests 8 / # pass 8 / # fail 0（determinism 5 + world-determinism 3；world-determinism 断言 GOLDEN_WORLD_HASH 字节相等）
```

## 步骤 4 — dungeon-server 零回归（E8 未改 server 代码，验证 28/28）
```bash
cd apps/dungeon-server
npm test
# 期望：# tests 28 / # pass 28 / # fail 0
```

## 步骤 5 — 核心循环 playtest 验证门（7 项 + GOLDEN_PLAYTEST_HASH 字节相等）
```bash
cd /Users/lnmacmini/Projects/personal-site/games/dungeon-online
node scripts/playtest-core-loop.mjs
# 期望：检查项 7 / 通过 7 / 失败 0 / 确定性 hash=889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14 / EXIT 0
```

## 步骤 6 — 纪律 B 静态守门（全仓 `hp=`/`status=` 变异只经 combat.ts/world.ts）
```bash
cd /Users/lnmacmini/Projects/personal-site/games/dungeon-online
grep -rnE "\.hp\s*=|status\s*=" packages/sim-core/src --include='*.ts' | grep -vE "combat\.ts|world\.ts"
# 期望：仅输出 skills.ts 内一行注释（描述契约），零真实赋值行。
# 真实赋值只应存在于 combat.ts / world.ts（已 grep -v 排除）。
```

## 步骤 7 — coop-skill 单测独立复跑（8 例，E8 新增）
```bash
cd packages/sim-core
node --experimental-strip-types --test tests/unit/coop-skill.test.ts
# 期望：# tests 8 / # pass 8 / # fail 0
# 覆盖：① SHIELD 落地+冷却+不直改 hp/status ② SHIELD 减伤经 resolveDamage ③ REVIVE 加速倒地救援+健康盟友 no-op
#       ④ TAUNT 改敌火(含对照组) ⑤ 冷却强控 ⑥ 协作技只指向其他玩家盟友 ⑦ 纪律 B 静态契约 ⑧ 纯函数校验
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 types/skills/world/combat/enemy-ai/rescue/input OK；末行测试 `# tests 51 / # pass 51 / # fail 0`。
- 步骤2 依次打印 `E8 SHIELD_ALLY OK` / `E8 REVIVE_BOOST OK` / `E8 TAUNT OK`（护盾减伤=9、救援+45、敌人改锁嘲讽者）。
- 步骤3 `# tests 8 / # pass 8 / # fail 0`（双 golden 含 GOLDEN_WORLD_HASH 字节相等断言）。
- 步骤4 `# tests 28 / # pass 28 / # fail 0`（E8 未改 server，零回归）。
- 步骤5 打印 `检查项：7 通过：7 失败：0` 且 EXITCODE=0，确定性 hash 与上值逐字符相等。
- 步骤6 仅输出 skills.ts 注释行（零真实 `hp=`/`status=` 赋值）。
- 步骤7 `# tests 8 / # pass 8 / # fail 0`。
- **合入门 smoke PASS 判据**：步骤1/2/3/4/5/6/7 全绿。
- 明确**不**在本 smoke 的项（属 DEFER，见 qa-plan-e8 §3）：协作技在 220-tick 核心闭环 golden 的实际触发（当前仅 coop-skill.test.ts 覆盖）、客户端技能触发/HUD/视觉（O-E7 Godot）、平衡初稿 P5 调优、R1 二进制 diff、S4.2/S4.4 客户端预测插值。
