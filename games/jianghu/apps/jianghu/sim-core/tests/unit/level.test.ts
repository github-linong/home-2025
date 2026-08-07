/**
 * level.test.ts — E9 升级/经验线（击杀经验 · 击杀者归属 · 升级阈值 · 连升 · 属性成长 · hp 回满）
 * ===========================================================================
 * 确定性（固定 seed + 固定输入，D9），覆盖（对应 GDD §8.3-3 双线养成·等级线 + 主理人 E9 拍板）：
 *   - 击杀普通怪 +5xp / 精英 +20xp / BOSS +80xp（ENEMY_XP，C7）；
 *   - 击杀者 = 最后造成伤害的玩家（lastDamagerSeatId 归属，多玩家场景）；
 *   - 升级阈值：xp >= xpForLevel(level) → 升级 + xp 扣减（50 → L2）；
 *   - 连升多级：while 循环（3 BOSS = 240xp → L3）；
 *   - 属性成长：每级 +1 atk / +5 maxHp（str→atk、vit→maxHp MVP 映射），L1 全零加成（golden 锚点）；
 *   - 升级瞬间 hp 回满（maxHp 提升后同步）；
 *   - 无属性变时伤害不变：L1 无装备普攻仍 = PLAYER_BASE_ATK（8）；
 *   - level/xp 不进 EntityState 快照（C12，防污染确定性 journal）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  PLAYER_BASE_ATK,
  PLAYER_MAX_HP,
  ENEMY_XP,
  xpForLevel,
  LEVEL_ATK_PER_LEVEL,
  LEVEL_MAXHP_PER_LEVEL,
} from "../../src/constants.ts";

const PLAYER_X = 16 * TILE; // 768
const PLAYER_Y = 15 * TILE; // 720
const NEAR = { x: PLAYER_X, y: PLAYER_Y };

const SKILL_ACTIONS = [InputAction.SKILL1, InputAction.SKILL2, InputAction.SKILL3, InputAction.SKILL4];

/** 造世界：玩家 seat0 于出生点（= NEAR），刷怪区在 NEAR，敌人被动不主动追击（击杀归属测试友好）。 */
function mkWorld(opts: { seed?: string; tier?: number; count?: number } = {}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E9-LEVEL",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: [
      {
        pos: NEAR,
        tier: opts.tier ?? 0,
        enemyTypeId: "n",
        count: opts.count ?? 1,
        respawnTicks: 100000, // 不复活，隔离升级判定
        aggression: "passive", // 被动：被打才反击（避免站桩被 BOSS 秒杀，聚焦升级断言）
      },
    ],
  });
}

function player(world: World, seat = 0) {
  return world.actors().find((a) => a.ownerId === seat)!;
}

function findLiveEnemy(world: World) {
  return world.actors().find((a) => (a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) && a.hp > 0);
}

function issueSkill(world: World, seat: number, slot: number, seq: { s: number }) {
  world.enqueueInput(seat, {
    seq: seq.s++,
    tick: world.tick,
    action: SKILL_ACTIONS[slot],
    dir: 0,
    skillSlot: slot,
  });
}

/**
 * 持续对最近存活敌人施放 SKILL 直至死亡（复用 playtest fightUntilDead 模式）。
 * 玩家可能被被动怪反击（被打才反击）而死亡 → 复活于安全区（= NEAR）后继续，技能门闸不受影响。
 * @returns 是否在 maxTicks 内击杀完成。
 */
function killAll(world: World, seat: number, slot: number, maxTicks = 5000): boolean {
  const seq = { s: 0 };
  for (let t = 0; t < maxTicks; t++) {
    const e = findLiveEnemy(world);
    if (!e) return true; // 已全部死亡
    const id = e.id;
    issueSkill(world, seat, slot, seq);
    world.step();
    const after = world.actors().find((a) => a.id === id);
    if (!after || after.hp <= 0) {
      // 本 tick 击杀（可能一次命中多只，继续循环清剩余）
      if (!findLiveEnemy(world)) return true;
    }
  }
  return !findLiveEnemy(world);
}

// ─────────────────────────────────────────────────────────────

test("击杀：普通怪 +5xp（L1 不升级，ENEMY_XP.normal=5）", () => {
  const world = mkWorld({ seed: "lv-normal" });
  assert.ok(killAll(world, 0, 0, 500), "普通怪应被 SKILL1 击杀（20dmg×2 > 30hp）");
  const p = player(world);
  assert.equal(p.level, 1, "5xp < xpForLevel(1)=50 → 不升级");
  assert.equal(p.xp, ENEMY_XP.normal, `xp = ${ENEMY_XP.normal}（击杀普通怪）`);
  assert.deepEqual(p.levelStats, { atk: 0, maxHp: 0 }, "L1 等级加成全零（golden 锚点）");
  assert.equal(world.consumeLevelUps().length, 0, "未升级 → 无升级事件");
});

test("击杀：精英 +20xp（ENEMY_XP.elite=20）", () => {
  const world = mkWorld({ seed: "lv-elite", tier: 1 });
  assert.ok(killAll(world, 0, 3, 3000), "精英（90hp）应被 SKILL4 击杀");
  const p = player(world);
  assert.equal(p.level, 1, "20xp < 50 → 不升级");
  assert.equal(p.xp, ENEMY_XP.elite, `xp = ${ENEMY_XP.elite}（击杀精英）`);
});

test("击杀：BOSS +80xp → 跨 50 阈值升级到 L2，xp 扣减 50", () => {
  const world = mkWorld({ seed: "lv-boss", tier: 2 });
  assert.ok(killAll(world, 0, 3, 5000), "BOSS（300hp）应被 SKILL4 击杀");
  const p = player(world);
  assert.equal(p.level, 2, "80 >= xpForLevel(1)=50 → 升级 L2");
  assert.equal(p.xp, 80 - 50, "xp 扣减阈值 50 → 剩 30");
  // 升级事件（编排层推送 character.level + 落库用）。
  const ups = world.consumeLevelUps();
  assert.equal(ups.length, 1, "一次击杀升级 → 1 个升级事件");
  assert.deepEqual(
    { seatId: ups[0].seatId, level: ups[0].level, xp: ups[0].xp, xpNext: ups[0].xpNext },
    { seatId: 0, level: 2, xp: 30, xpNext: xpForLevel(2) },
    "事件携带 level/xp/xpNext（xpNext = xpForLevel(2)=141）",
  );
});

test("击杀者归属：最后造成伤害的玩家获得经验（lastDamagerSeatId）", () => {
  // 双玩家：seat0 先打（不算击杀），seat1 补刀致死 → 经验归 seat1。
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "lv-credit",
    phase: RoomPhase.OVERWORLD,
    lootTokens: 0,
    spawnZones: [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1, respawnTicks: 100000, aggression: "passive" }],
  });
  world.addPlayer(0, "u0", NEAR);
  world.addPlayer(1, "u1", { x: NEAR.x + 10, y: NEAR.y });
  const e0 = findLiveEnemy(world)!;
  const seq = { s: 0 };
  // seat0 命中一次（30 → 10，lastDamagerSeatId=0）。
  issueSkill(world, 0, 0, seq);
  world.step();
  const e1 = world.actors().find((a) => a.id === e0.id)!;
  assert.equal(e1.hp, ENEMY_BASE_HP - 20, "seat0 首击生效（30→10）");
  // seat1 补刀（10 → -10，lastDamagerSeatId=1 → 击杀者 = seat1）。
  issueSkill(world, 1, 0, seq);
  world.step();
  assert.ok(!findLiveEnemy(world), "敌人应已被 seat1 击杀");
  const p0 = player(world, 0);
  const p1 = player(world, 1);
  assert.equal(p1.xp, ENEMY_XP.normal, "击杀者（最后造成伤害的玩家 seat1）获得 +5xp");
  assert.equal(p0.xp, 0, "非击杀者 seat0 不得经验（仅首击不算击杀）");
});

test("升级阈值：10 只普通怪 = 50xp → 恰跨阈值升级 L2，xp 归零", () => {
  const world = mkWorld({ seed: "lv-threshold", count: 10 });
  assert.ok(killAll(world, 0, 0, 5000), "10 只普通怪应被击杀");
  const p = player(world);
  assert.equal(p.level, 2, "50xp 恰 == xpForLevel(1) → 升级 L2");
  assert.equal(p.xp, 0, "xp 恰扣减 50 → 归零");
  const ups = world.consumeLevelUps();
  assert.ok(ups.length >= 1, "升级事件已产出");
  assert.equal(ups[ups.length - 1].level, 2, "最终升级事件 L2");
});

test("连升多级：3 BOSS = 240xp → while 循环升级到 L3（xp 依次扣 50/141）", () => {
  const world = mkWorld({ seed: "lv-multi", tier: 2, count: 3 });
  assert.ok(killAll(world, 0, 3, 6000), "3 BOSS 应被击杀");
  const p = player(world);
  // 240 - 50 (L1→L2) = 190；190 - 141 (L2→L3) = 49；49 < xpForLevel(3)=259 → 停。
  assert.equal(p.level, 3, "240xp → 连升两级到 L3");
  assert.equal(p.xp, 240 - xpForLevel(1) - xpForLevel(2), `xp = 240-50-141 = ${240 - xpForLevel(1) - xpForLevel(2)}`);
  const ups = world.consumeLevelUps();
  assert.ok(ups.length >= 1, "升级事件已产出");
  const last = ups[ups.length - 1];
  assert.deepEqual(
    { level: last.level, xp: last.xp, xpNext: last.xpNext },
    { level: 3, xp: 240 - xpForLevel(1) - xpForLevel(2), xpNext: xpForLevel(3) },
    "最终事件反映 L3 当前状态",
  );
});

test("属性成长：每级 +1 atk / +5 maxHp（str→atk、vit→maxHp MVP 映射）", () => {
  const world = mkWorld({ seed: "lv-growth", tier: 2 });
  assert.ok(killAll(world, 0, 3, 5000), "BOSS 击杀 → 升级 L2");
  const p = player(world);
  assert.deepEqual(p.levelStats, { atk: LEVEL_ATK_PER_LEVEL, maxHp: LEVEL_MAXHP_PER_LEVEL }, "L2 等级加成 = +1atk/+5maxHp");
  assert.equal(p.maxHp, PLAYER_MAX_HP + LEVEL_MAXHP_PER_LEVEL, `maxHp = 100 + 5 = ${PLAYER_MAX_HP + LEVEL_MAXHP_PER_LEVEL}`);
  assert.equal(p.hp, p.maxHp, "升级瞬间 hp 回满（同步新上限）");
  // 快照 attrs：等级反映到面板（str/dex/vit 三系各 +1，atk = 基础 8 + 等级 1）。
  const me = world.snapshot().entities.find((e) => e.ownerId === 0)!;
  assert.equal(me.attrs!.atk, PLAYER_BASE_ATK + LEVEL_ATK_PER_LEVEL, "面板攻击 = 8 + 1 = 9");
  assert.equal(me.attrs!.maxHp, PLAYER_MAX_HP + LEVEL_MAXHP_PER_LEVEL, "面板生命 = 105");
  assert.equal(me.attrs!.str, 6, "STR 三系各 +1（基础 5 → 6）");
  assert.equal(me.attrs!.dex, 6, "DEX 三系各 +1");
  assert.equal(me.attrs!.vit, 6, "VIT 三系各 +1");
});

test("升级 hp 回满：升级瞬间 hp 同步到新上限（maxHp 提升后回满）", () => {
  const world = mkWorld({ seed: "lv-heal", tier: 2 });
  // 先让玩家受一次伤（BOSS 被动反击 80dmg；玩家攻击触发 provocation）。
  const seq = { s: 0 };
  issueSkill(world, 0, 3, seq);
  for (let t = 0; t < 60; t++) world.step(); // 等待 BOSS 反击窗口内接触伤害
  const before = player(world);
  assert.ok(before.hp < before.maxHp, "玩家应先受伤（hp < maxHp）");
  assert.ok(killAll(world, 0, 3, 5000), "随后击杀 BOSS → 升级");
  const p = player(world);
  assert.equal(p.level, 2, "升级到 L2");
  assert.equal(p.hp, p.maxHp, "升级瞬间 hp 回满（= 新 maxHp 105）");
  assert.equal(p.maxHp, PLAYER_MAX_HP + LEVEL_MAXHP_PER_LEVEL, "新 maxHp = 105");
});

test("无属性变时伤害不变：L1 无装备普攻仍 = PLAYER_BASE_ATK（8）", () => {
  const world = mkWorld({ seed: "lv-noattr" });
  const e0 = findLiveEnemy(world)!;
  assert.equal(e0.hp, ENEMY_BASE_HP, "普通怪基础 hp=30");
  const seq = { s: 0 };
  world.enqueueInput(0, { seq: seq.s++, tick: world.tick, action: InputAction.ATTACK, dir: 0, targetEntityId: e0.id });
  world.step();
  const e1 = findLiveEnemy(world)!;
  const dmg = ENEMY_BASE_HP - e1.hp;
  assert.equal(dmg, PLAYER_BASE_ATK, `L1 无装备普攻伤害 = ${PLAYER_BASE_ATK}（未升级 → 属性零加成）`);
  const p = player(world);
  assert.equal(p.level, 1, "未升级（1 只普通怪 +5xp < 50）");
  assert.equal(p.levelStats!.atk, 0, "L1 atk 加成 0 → 伤害不变量");
});

test("C12：level/xp 不进 EntityState 快照（防污染确定性 journal）", () => {
  const world = mkWorld({ seed: "lv-snap" });
  assert.ok(killAll(world, 0, 0, 500), "击杀普通怪（+5xp）");
  const p = player(world);
  assert.equal(p.xp, 5, "world actor 持有 xp（会话内权威）");
  const me = world.snapshot().entities.find((e) => e.ownerId === 0)!;
  assert.equal("level" in me, false, "快照不含 level（C12）");
  assert.equal("xp" in me, false, "快照不含 xp（C12）");
  // L1 attrs 与 E7/E8 基线一致（atk=8/maxHp=100/crit=0）→ 二进制协议字节稳定。
  assert.deepEqual(
    { str: me.attrs!.str, dex: me.attrs!.dex, vit: me.attrs!.vit, atk: me.attrs!.atk, maxHp: me.attrs!.maxHp, crit: me.attrs!.crit },
    { str: 5, dex: 5, vit: 5, atk: PLAYER_BASE_ATK, maxHp: PLAYER_MAX_HP, crit: 0 },
    "L1 attrs 与基线一致（golden 锚点）",
  );
});
