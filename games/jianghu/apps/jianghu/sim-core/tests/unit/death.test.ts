/**
 * death.test.ts — E10 玩家死亡体验确定性单测（倒地 → 躺尸计时 → 复活回城 + 反馈）
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now）：
 *   ① hp≤0 → DOWNED（status 位 + hp=0 + parryState/PARRY_ACTIVE 清）
 *   ② 倒地输入全无效（MOVE 坐标不变、SKILL 不扣敌人 hp、PARRY 不生效、STOP 无副作用；
 *      seq 仍单调推进由 enqueueInput 保证）
 *   ③ 敌人不攻击 DOWNED 玩家（aggressive 索敌跳过 → IDLE；接触攻击不扣 hp；CHASE 解除）
 *   ④ 倒计时到 → 复活（hp 回满当前 maxHp 含等级加成、坐标=RESPAWN_POS、DOWNED 清、IFRAME 置位）
 *   ⑤ IFRAME：复活后敌人接触攻击无效；REVIVE_IFRAME_TICKS 到期清位后恢复正常
 *   ⑥ 倒地期间不被拾取（地面掉落与倒地玩家重叠不产生 pickup）
 *   ⑦ 确定性：同 seed + 同输入序列 ⇒ 同死亡/复活 tick 序列
 *   ⑧ 副本复活点可配置（E15）：respawnPos=entryTile 复活回 entryTile；主世界默认 RESPAWN_POS 不变
 *
 * 说明：直接改 actor 字段（hp/status/downedAtTick）等价于 playtest 的 relocateToCorner
 *   先例（world.actors() 返回浅拷贝，Actor 对象同引用）；不依赖真实攻击时序的场景用
 *   强制倒地保证断言独立于敌人节奏。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction, EntityStatus } from "../../src/types.ts";
import {
  TILE,
  RESPAWN_POS,
  PLAYER_MAX_HP,
  DOWNED_TICKS,
  REVIVE_IFRAME_TICKS,
  LOOT_GROUND_TTL_TICKS,
} from "../../src/constants.ts";

function mkWorld(opts: {
  seed?: string;
  players?: { seatId: number; userId: string }[];
  spawnZones?: Parameters<typeof createWorld>[0]["spawnZones"];
  lootTokens?: number;
}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "DEATH",
    phase: RoomPhase.OVERWORLD,
    players: opts.players,
    spawnZones: opts.spawnZones,
    lootTokens: opts.lootTokens ?? 0,
  });
}

function findPlayer(world: World, seat = 0) {
  return world.actors().find((a) => a.ownerId === seat)!;
}
function findEnemy(world: World, kind = EntityKind.ENEMY) {
  return world.actors().find((a) => a.kind === kind)!;
}

/** 强制玩家进入倒地（直接置位；同 playtest 直接改 actor 的先例）。 */
function forceDowned(world: World, seat = 0): void {
  const p = findPlayer(world, seat);
  p.hp = 0;
  p.status |= EntityStatus.DOWNED;
  p.downedAtTick = world.tick;
}

// ─────────────────────────────────────────────────────────────
// ① hp≤0 → DOWNED
// ─────────────────────────────────────────────────────────────

test("① 玩家 hp≤0 → DOWNED（status 位 + hp=0 + parryState 清）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({
    seed: "death-1",
    spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, aggression: "aggressive" }], // 精英 atk=24
  });
  const enemy = findEnemy(world);
  world.addPlayer(0, "u0", { x: enemy.x, y: enemy.y }); // 接触（dist≈0）
  const player = findPlayer(world);
  // 手动置格挡窗口：倒地瞬间应清 PARRY_ACTIVE + parryState（同 tick 触发死亡）。
  player.parryState = { active: true, windowEndTick: world.tick + 20 };
  player.status |= EntityStatus.PARRY_ACTIVE;
  player.hp = 4; // 4 - 24 < 0 → 一击即死（t=0 精英接触攻击）
  world.step();
  const p = findPlayer(world);
  assert.ok(p.status & EntityStatus.DOWNED, "hp≤0 应进入倒地");
  assert.equal(p.hp, 0, "倒地 hp 归零");
  assert.ok(!(p.status & EntityStatus.PARRY_ACTIVE), "倒地清 PARRY_ACTIVE");
  assert.equal(p.parryState, undefined, "倒地清 parryState");
  assert.equal(p.downedAtTick, 0, "记录倒地起始 tick");
});

// ─────────────────────────────────────────────────────────────
// ② 倒地输入全无效
// ─────────────────────────────────────────────────────────────

test("② 倒地输入全无效（MOVE 不动 / SKILL 不扣血 / PARRY 不生效 / STOP 无副作用）", () => {
  const world = mkWorld({
    seed: "death-inp",
    players: [{ seatId: 0, userId: "u0" }],
    // 敌人精确放在玩家东侧 40px：SKILL 射程(72)内、接触(48)内；tier 0 passive 不主动攻击。
    spawnZones: [{ pos: { x: 16 * TILE + 40, y: 15 * TILE }, tier: 0, enemyTypeId: "n", count: 1 }],
  });
  const player = findPlayer(world); // 出生点 = (16*TILE, 15*TILE)
  const enemy = findEnemy(world);
  enemy.x = 16 * TILE + 40;
  enemy.y = 15 * TILE; // 精确放置，避开散布不确定性
  forceDowned(world);
  const startX = player.x;
  const startY = player.y;
  const enemyHp0 = enemy.hp;
  let seq = 0;

  // MOVE：坐标不变
  world.enqueueInput(0, { seq: ++seq, tick: world.tick, action: InputAction.MOVE, dir: 0 });
  world.step();
  let p = findPlayer(world);
  assert.equal(p.x, startX, "倒地 MOVE 不移动（x）");
  assert.equal(p.y, startY, "倒地 MOVE 不移动（y）");

  // SKILL：敌人在射程内但不扣血（输入被丢弃而非范围 miss）
  world.enqueueInput(0, { seq: ++seq, tick: world.tick, action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
  world.step();
  const e = findEnemy(world);
  assert.equal(e.hp, enemyHp0, "倒地 SKILL 不扣敌人 hp");

  // PARRY：不生效（无 parryState / 无 PARRY_ACTIVE）
  world.enqueueInput(0, { seq: ++seq, tick: world.tick, action: InputAction.PARRY, dir: 0 });
  world.step();
  p = findPlayer(world);
  assert.ok(!(p.status & EntityStatus.PARRY_ACTIVE), "倒地 PARRY 不生效");
  assert.equal(p.parryState, undefined, "倒地 PARRY 不设窗口");

  // STOP：无副作用（仍倒地、坐标不变；STOP 本身不缓冲）
  world.enqueueInput(0, { seq: ++seq, tick: world.tick, action: InputAction.STOP, dir: 0 });
  world.step();
  p = findPlayer(world);
  assert.ok(p.status & EntityStatus.DOWNED, "倒地状态保持");
  assert.equal(p.x, startX, "STOP 后坐标仍不变");
});

// ─────────────────────────────────────────────────────────────
// ③ 敌人不攻击 DOWNED 玩家（索敌跳过 + 接触攻击跳过 + CHASE 解除）
// ─────────────────────────────────────────────────────────────

test("③ 敌人不攻击 DOWNED 玩家（索敌跳过 → IDLE；接触攻击不扣 hp）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({
    seed: "death-ai",
    spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, aggression: "aggressive" }],
  });
  const enemy = findEnemy(world);
  world.addPlayer(0, "u0", { x: enemy.x, y: enemy.y }); // 接触（dist≈0），aggressive 会攻击
  forceDowned(world);
  const ex = enemy.x;
  const ey = enemy.y;
  for (let i = 0; i < 30; i++) world.step();
  const p = findPlayer(world);
  const e = findEnemy(world);
  assert.equal(p.hp, 0, "敌人接触攻击跳过：hp 保持 0（未被扣成负数）");
  assert.ok(p.status & EntityStatus.DOWNED, "仍倒地");
  assert.equal(e.x, ex, "倒地玩家不在索敌范围 → 敌人 IDLE（x 不变）");
  assert.equal(e.y, ey, "倒地玩家不在索敌范围 → 敌人 IDLE（y 不变）");
});

test("③b 倒地解除已在 CHASE 的敌人追击（目标归空 → IDLE）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({
    seed: "death-ai2",
    spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, aggression: "aggressive" }],
  });
  const enemy = findEnemy(world);
  const x0 = enemy.x; // 引用同一 Actor 对象 → 先快照起始 x
  world.addPlayer(0, "u0", { x: enemy.x + 120, y: enemy.y }); // 仇恨内(240)、接触外(48)
  world.step(); // t0：aggressive 索敌 CHASE 靠近
  const chaseX = findEnemy(world).x;
  assert.ok(chaseX > x0, "倒地前敌人 CHASE 靠近（x 增大）");
  forceDowned(world); // 玩家倒地
  const stopX = findEnemy(world).x;
  for (let i = 0; i < 10; i++) world.step();
  const e = findEnemy(world);
  assert.equal(e.x, stopX, "玩家倒地后敌人停止追击（IDLE，x 不变）");
});

// ─────────────────────────────────────────────────────────────
// ④ 倒计时到 → 复活
// ─────────────────────────────────────────────────────────────

test("④ 倒计时到 → 复活（hp=当前 maxHp 含等级加成、坐标=RESPAWN_POS、DOWNED 清、IFRAME 置位）", () => {
  const world = mkWorld({ seed: "death-revive", players: [{ seatId: 0, userId: "u0" }] });
  const player = findPlayer(world);
  // E9：升到 L2 → maxHp = 100 + (2-1)*5 = 105（验证复活回满含等级加成）。
  player.level = 2;
  player.levelStats = { atk: 1, maxHp: 5 };
  player.maxHp = PLAYER_MAX_HP + (player.equipStats?.maxHp ?? 0) + player.levelStats.maxHp;
  forceDowned(world);
  player.x = 5 * TILE; // 移到远处，验证复活瞬移回城
  player.y = 5 * TILE;

  // 未到点：仍倒地（t 历经 0..DOWNED_TICKS-1，均 < downedAtTick+DOWNED_TICKS）
  for (let i = 0; i < DOWNED_TICKS; i++) world.step();
  let p = findPlayer(world);
  assert.ok(p.status & EntityStatus.DOWNED, "未到点仍倒地");
  assert.equal(p.hp, 0);

  // 到点（t = DOWNED_TICKS ≥ downedAtTick+DOWNED_TICKS）：复活
  const tickBeforeRevive = world.tick; // = DOWNED_TICKS
  world.step();
  p = findPlayer(world);
  assert.ok(!(p.status & EntityStatus.DOWNED), "复活后 DOWNED 清");
  assert.equal(p.hp, p.maxHp, "hp 回满当前 maxHp");
  assert.equal(p.hp, 105, "含等级加成 maxHp=105");
  assert.equal(p.x, RESPAWN_POS.x, "复活回 RESPAWN_POS.x");
  assert.equal(p.y, RESPAWN_POS.y, "复活回 RESPAWN_POS.y");
  assert.ok(p.status & EntityStatus.IFRAME, "复活后 IFRAME 置位");
  assert.equal(p.iframesUntilTick, tickBeforeRevive + REVIVE_IFRAME_TICKS, "IFRAME 截止 tick 正确");
});

// ─────────────────────────────────────────────────────────────
// ⑤ IFRAME：复活后敌人攻击无效；到期清位后恢复正常
// ─────────────────────────────────────────────────────────────

test("⑤ IFRAME：复活后敌人接触攻击无效；到期清位后恢复正常", () => {
  const world = mkWorld({
    seed: "death-ifr",
    players: [{ seatId: 0, userId: "u0" }],
    spawnZones: [{ pos: RESPAWN_POS, tier: 1, enemyTypeId: "e", count: 1, aggression: "aggressive" }], // 精英 atk=24
  });
  const enemy = findEnemy(world);
  enemy.x = RESPAWN_POS.x; // 精确放置（避开散布；玩家复活后必在接触内）
  enemy.y = RESPAWN_POS.y;
  forceDowned(world);

  // 推进至复活（倒地起始 tick=0 → 复活于 t=DOWNED_TICKS）
  for (let i = 0; i < DOWNED_TICKS + 1; i++) world.step();
  let p = findPlayer(world);
  assert.ok(p.status & EntityStatus.IFRAME, "复活后应带 IFRAME");
  assert.equal(p.hp, p.maxHp, "复活满血");
  const hpAtRevive = p.hp;

  // IFRAME 窗口内（REVIVE_IFRAME_TICKS-1 步内，t < iframesUntilTick）：敌人攻击无效
  for (let i = 0; i < REVIVE_IFRAME_TICKS - 1; i++) world.step();
  p = findPlayer(world);
  assert.equal(p.hp, hpAtRevive, "IFRAME 期间敌人接触攻击无效（hp 不变）");
  assert.ok(p.status & EntityStatus.IFRAME, "IFRAME 尚未到期");

  // 到期那一步：玩家循环先清 IFRAME → 敌人 AI 同 tick 可见无 IFRAME → 攻击生效
  world.step();
  p = findPlayer(world);
  assert.ok(!(p.status & EntityStatus.IFRAME), "IFRAME 到期清位");
  assert.equal(p.iframesUntilTick, undefined, "iframesUntilTick 清理");
  assert.ok(p.hp < hpAtRevive, "IFRAME 到期后敌人攻击恢复（hp 下降）");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 倒地不拾取
// ─────────────────────────────────────────────────────────────

test("⑥ 倒地不拾取：地面掉落与倒地玩家重叠 → 无 pickup，掉落保留", () => {
  const world = mkWorld({ seed: "death-pick", players: [{ seatId: 0, userId: "u0" }] });
  const player = findPlayer(world);
  forceDowned(world);
  world.spawnGroundLoot(0, { itemId: 777, rarity: 2, affixes: [1, 2], ttlTicks: LOOT_GROUND_TTL_TICKS }); // 落在玩家脚下
  world.step();
  const picks = world.consumePickups();
  assert.equal(picks.length, 0, "倒地玩家不产生拾取");
  assert.ok(
    world.actors().some((a) => a.kind === EntityKind.LOOT_GROUND && a.loot?.itemId === 777),
    "掉落保留在地面（未被移除）",
  );
});

// ─────────────────────────────────────────────────────────────
// ⑧ 副本复活点可配置（E15：respawnPos）
// ─────────────────────────────────────────────────────────────

test("⑧ 副本 world（respawnPos=entryTile）死亡复活到 entryTile；主世界默认 RESPAWN_POS 不变", () => {
  // 副本：respawnPos = entryTile（run-manager.enterInstance 传 spec.entryTile）。
  const entry = { x: 5 * TILE, y: 7 * TILE };
  const dungeon = createWorld({
    runId: "d",
    roomId: "inst",
    seed: "dungeon-death",
    phase: RoomPhase.DUNGEON,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    respawnPos: entry,
  });
  const dp = findPlayer(dungeon);
  forceDowned(dungeon);
  dp.x = 30 * TILE; // 移到远处，验证复活瞬移回 entryTile
  dp.y = 20 * TILE;
  for (let i = 0; i < DOWNED_TICKS + 1; i++) dungeon.step();
  const dp2 = findPlayer(dungeon);
  assert.ok(!(dp2.status & EntityStatus.DOWNED), "副本复活后 DOWNED 清");
  assert.equal(dp2.hp, dp2.maxHp, "副本复活 hp 回满");
  assert.equal(dp2.x, entry.x, "副本复活回 entryTile.x（防复活卡墙/出副本）");
  assert.equal(dp2.y, entry.y, "副本复活回 entryTile.y");

  // 主世界：缺省 respawnPos → RESPAWN_POS 不变（现有 ④ 已覆盖，此处显式再验保持 golden）。
  const world = mkWorld({ seed: "death-respawn-default", players: [{ seatId: 0, userId: "u0" }] });
  const p = findPlayer(world);
  forceDowned(world);
  p.x = 10 * TILE;
  p.y = 10 * TILE;
  for (let i = 0; i < DOWNED_TICKS + 1; i++) world.step();
  const p2 = findPlayer(world);
  assert.equal(p2.x, RESPAWN_POS.x, "主世界复活仍回 RESPAWN_POS.x（golden 稳）");
  assert.equal(p2.y, RESPAWN_POS.y, "主世界复活仍回 RESPAWN_POS.y（golden 稳）");
});

// ─────────────────────────────────────────────────────────────
// ⑦ 确定性：同 seed + 同输入序列 ⇒ 同死亡/复活 tick 序列
// ─────────────────────────────────────────────────────────────

test("⑦ 确定性：同 seed + 同输入序列 ⇒ 同死亡/复活 tick 序列（D9）", () => {
  const run = (): { deathTick: number; reviveTick: number } => {
    const P = { x: 20 * TILE, y: 15 * TILE };
    const world = mkWorld({
      seed: "death-det",
      players: [{ seatId: 0, userId: "u0" }],
      spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, aggression: "aggressive" }],
    });
    const player = findPlayer(world);
    const enemy = findEnemy(world);
    player.x = enemy.x; // 精确接触（散布由 seed 决定 → 两次运行一致）
    player.y = enemy.y;
    let deathTick = -1;
    let reviveTick = -1;
    let seenDowned = false;
    for (let i = 0; i < 300; i++) {
      world.step();
      const p = findPlayer(world);
      const downed = !!(p.status & EntityStatus.DOWNED);
      if (downed && !seenDowned) {
        seenDowned = true;
        deathTick = world.tick;
      }
      if (seenDowned && !downed) {
        reviveTick = world.tick;
        break;
      }
    }
    return { deathTick, reviveTick };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 → 死亡/复活 tick 序列字节级一致");
  assert.ok(a.deathTick >= 0 && a.reviveTick > a.deathTick, "真实发生倒地→复活（death/revive 非占位）");
});
