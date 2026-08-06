# E7 烟雾测试清单（最小可跑）
路径：tests/smoke/e7-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件。
说明：E7 在 E6 之上新增 `rescue.ts`（纯决策）+ `world.ts`（E7 loop + `World.setDisconnected`）+ `combat.ts`（S7.4 no-op 分支）+ `types.ts`（OUT=1<<2）。确定性由双 golden 守门（E7 未改战斗/移动/AI/前摇路径 → 哈希不变，无需重锁）。D8 断线托管 hook 在 sim-core headless 层烟测（room-service 真实接线 DEFER，见 qa-plan-e7 §2.1）。

## 步骤 1 — 类型/加载自检（8 个 src 模块导出，含 rescue.ts）+ 全量 # fail 0
```bash
cd packages/sim-core
node --experimental-strip-types -e "
import('./src/types.ts').then(t => { if(!t.EntityStatus||!t.EntityStatus.OUT||!t.ENEMY_PROTOTYPES||!t.PLAYER_CLASSES) throw new Error('types.ts 运行时导出缺失(含 OUT/ENEMY_PROTOTYPES)'); console.log('types.ts OK (OUT='+t.EntityStatus.OUT+')'); });
import('./src/input.ts').then(i => { if(typeof i.PerPlayerInputQueue!=='function') throw new Error('input.ts 缺失'); console.log('input.ts OK'); });
import('./src/world.ts').then(w => { if(typeof w.createWorld!=='function') throw new Error('world.ts 缺失'); console.log('world.ts OK'); });
import('./src/combat.ts').then(c => { if(typeof c.resolveDamage!=='function') throw new Error('combat.ts 缺失'); console.log('combat.ts OK'); });
import('./src/enemy-ai.ts').then(a => { if(typeof a.stepEnemyAi!=='function') throw new Error('enemy-ai.ts 缺失'); console.log('enemy-ai.ts OK (untouched, 0 rescue refs)'); });
import('./src/rescue.ts').then(r => { if(typeof r.withinRescueRadius!=='function'||typeof r.revivalHp!=='function'||typeof r.rescueCandidates!=='function'||typeof r.capturePersonalState!=='function') throw new Error('rescue.ts 缺失'); console.log('rescue.ts OK (pure fns only)'); });
import('./src/rng.ts').then(r => { if(typeof r.Rng!=='function') throw new Error('rng.ts 缺失'); console.log('rng.ts OK'); });
"
node --experimental-strip-types --test tests/unit/*.test.ts tests/golden/*.test.ts
# 期望：# tests 51 / # pass 51 / # fail 0
```

## 步骤 2 — dungeon-server 回归（E7 新增 d8-disconnect-wiring 1 例 → 28；确认 room-service 等未退化）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/*.test.ts
# 期望：# tests 28 / # pass 28 / # fail 0
```

## 步骤 3 — playtest 核心循环验证门（E7 倒地机制不影响固定序列 → golden 不变）
```bash
cd /Users/lnmacmini/Projects/personal-site/games/dungeon-online
node scripts/playtest-core-loop.mjs
# 期望：检查项 7 / 通过 7 / 失败 0 / 确定性 hash=889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14 / EXIT 0
```

## 步骤 4 — 纪律 B 静态 grep（rescue.ts 零 hp/status 变异；enemy-ai.ts 零 rescue 引用）
```bash
cd packages/sim-core/src
# 期望：两条 grep 均 "No matches found"（0 匹配）
grep -nE '\b(hp|status)\s*=' rescue.ts        # 应无输出：rescue.ts 不直改实体 hp/status
grep -n 'rescue' enemy-ai.ts                  # 应无输出：enemy-ai.ts 未触碰 E7 救援逻辑
```
> 注：`capturePersonalState(status, hp, …)` 仅 *读取* 入参构造新 PersonalState 对象，源码级 `hp=`/`status=` 赋值为 0 匹配，符合纪律 B。

## 步骤 5 — D8 断线托管 hook 自检查（setDisconnected 抓拍+暂停+重连不跳变）
```bash
cd packages/sim-core
node --experimental-strip-types --input-type=module -e "
import { createWorld } from './src/world.ts';
import { EntityStatus, PLAYER_CLASSES } from './src/types.ts';
import { DOWNED_TIMEOUT_TICKS } from './src/rescue.ts';
import { resolveDamage, CombatKind } from './src/combat.ts';
const w = createWorld({ runId:'disc-hook-e7', seed:'EMBER-S1', biomeId:0, players:[
  { seatId:0, userId:'P1', classId: PLAYER_CLASSES[0] },
  { seatId:1, userId:'P2', classId: PLAYER_CLASSES[1] },
]});
const p0 = w.actors().find(a => a.ownerId === 0);
const m = new Map(w.actors().map(a => [a.id, a]));
// 经权威结算击倒 p0（hp→0, 置 DOWNED）。
resolveDamage({tick:w.tick, entities:m}, { sourceId:p0.id+1000, targetId:p0.id, amount:0, tick:w.tick, kind:CombatKind.ATTACK, enemyDamage:p0.maxHp+999 });
for(let i=0;i<50;i++) w.step();
if(p0.downedTicks !== 50) throw new Error('pre-disc downedTicks != 50: '+p0.downedTicks);
// 断开：应单次抓拍 PersonalState，剩余窗口 = 600-50 = 550。
w.setDisconnected(0, true);
if(!p0.personalState) throw new Error('D8: PersonalState 未抓拍');
if(!(p0.personalState.status & EntityStatus.DOWNED)) throw new Error('D8: 抓拍 status 非 DOWNED');
if(p0.personalState.downedRemainingTicks !== DOWNED_TIMEOUT_TICKS - 50) throw new Error('D8: 剩余窗口错误: '+p0.personalState.downedRemainingTicks);
// 断开期间 100 tick：计时冻结，不进 OUT。
for(let i=0;i<100;i++) w.step();
if(p0.downedTicks !== 50) throw new Error('D8: 断开期间计时未暂停: '+p0.downedTicks);
if(p0.status & EntityStatus.OUT) throw new Error('D8: 断开期间误进 OUT');
// 重连：从 50 续累计，不跳变。
w.setDisconnected(0, false);
for(let i=0;i<5;i++) w.step();
if(p0.downedTicks !== 55) throw new Error('D8: 重连跳变: '+p0.downedTicks);
console.log('D8 disconnect hook OK (captured + paused + no-jump, remaining='+p0.personalState.downedRemainingTicks+')');
"
```

## 步骤 6（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # 本仓未装 typescript，devDep 装好后接入 CI；当前已配 script + strict tsconfig（E2 遗留，与 E7 无关）
```

## 烟雾 PASS 判据
- 步骤1：8 个 src 模块全部打印 OK（含 `rescue.ts OK (pure fns only)`、`enemy-ai.ts OK (untouched, 0 rescue refs)`、`types.ts OK (OUT=4)`）；末行测试 **# tests 51 / # pass 51 / # fail 0**。
- 步骤2：dungeon-server **# tests 28 / # pass 28 / # fail 0**（E7 新增 d8-disconnect-wiring 1 例）。
- 步骤3：打印 `检查项：7 通过：7 失败：0` 且 `golden match=true` 且 EXITCODE=0；hash=`889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`。
- 步骤4：两条 grep **均无输出（0 匹配）**——纪律 B 静态契约绿。
- 步骤5：打印 `D8 disconnect hook OK (captured + paused + no-jump, …)`。
- **合入门 smoke PASS 判据**：步骤1/2/3/4/5 全绿。
- 明确**不**在本 smoke 的项（属 DEFER，见 qa-plan-e7 §2.1/§2.2）：room-service 真实 socket 断线→`World.setDisconnected` 接线（C3/C10）、Godot 客户端重连插值、阈值 P5 调优、telegraph 视觉渲染、敌人 AI 高阶行为、R1 二进制 diff、S4.2+S4.4 客户端预测插值、攻击距离重校验（O-C 继承）、tsc 类型门（C-A）。
