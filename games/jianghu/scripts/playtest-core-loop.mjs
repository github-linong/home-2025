/**
 * playtest-core-loop.mjs — 核心循环机械闭环 · headless 可玩性验证台（jianghu 版）
 * ===========================================================================
 * 目的：作为用户已批准的「好玩吗」验证门的形式化证据，把 Sprint 1 E1–E5 核心循环
 *       （移动 → 战斗 → 掉装 → 拾取 → 进副本 → 副本战斗+BOSS → 出本归位 → 重连订阅）
 *       在 headless 下**真实驱动** sim-core + run-manager + protocol 路径，逐项量化断言。
 *
 * 约束：本脚本是**独立的验证工具**，不修改 sim-core/src、src/ 任何运行时代码，
 *       仅动态 import 其 .ts 模块 + fake Conn（无真实 ws）驱动真实逻辑（同
 *       tests/instance-lifecycle.test.ts 的做法）。
 *
 * 运行：node --experimental-strip-types scripts/playtest-core-loop.mjs
 *       退出码 0 = 全部通过；非 0 = 存在失败项。
 *
 * 确定性（D9）：脚本主流程在**同步切片**内完成（动态 import 之后无任何 await），
 *   RESIDENT run loop（setInterval）无法抢占同步代码 → serverTick 冻结为 0 →
 *   实例 seed / 布局 / BOSS hp / 掉落全部字节级确定。同 seed 连跑 2 次，
 *   journal sha256 必须相等；非空 GOLDEN_PLAYTEST_HASH 时还须 == 锁定值。
 *   （实例 roomId 为服务端随机生成的编排身份，非 sim 状态，刻意不入哈希——见报告。）
 *
 * 覆盖：C-Net-2（进出本原子切域）/ C-Dgn-1（seed 仅服务端派生，快照不含）/ C-Dgn-2
 *       （成员锁定）/ C-Dgn-3（BOSS 置深由 dungeonGen 保证，此处验证 BOSS 可击杀 +
 *       phase 推进）/ C-Dgn-4（出本解散回安全区）/ D9（确定性）/ C11（seq 单调）。
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../apps/jianghu");
const SRC = resolve(APP, "src");
const SIM = resolve(APP, "sim-core/src");

// 真实运行时模块（.ts 经 --experimental-strip-types 直接加载）。
const worldMod = await import(resolve(SIM, "world.ts"));
const types = await import(resolve(SIM, "types.ts"));
const constants = await import(resolve(SIM, "constants.ts"));
const dungeonGen = await import(resolve(SIM, "dungeonGen.ts"));
const runManager = await import(resolve(SRC, "run-manager.ts"));
const protocol = await import(resolve(SRC, "protocol.ts"));
const roomService = await import(resolve(SRC, "room-service.ts"));
const registry = await import(resolve(SRC, "connection-registry.ts"));

const { createWorld } = worldMod;
const { InputAction, EntityKind, RoomPhase } = types;
const {
  TILE,
  RESPAWN_POS,
  ENEMY_BASE_HP,
  HP_MULT,
  LOOT_GROUND_TTL_TICKS,
  BOSS_PHASE_THRESHOLD,
  SKILL_DAMAGE,
  SKILL_CD_BY_SLOT, // E6：BOSS 战 poke 用（slot3 cd=96，C7 单一来源）
  CHEST_TTL_TICKS, // E20：宝箱存活时长（tick）= 5min @12Hz
  CHEST_STONES, // E20：开箱强化石×2
} = constants;
const { computeInstanceSeed } = dungeonGen;
const {
  bootResidentRun,
  getWorld,
  addPlayerToRoom,
  enqueueInput,
  isInstanceRunning,
} = runManager;
const { dispatch } = protocol;
const { RESIDENT_ROOM_ID, getRoom, getInstanceRoom, isMember } = roomService;
const { registerConnection, setRoom } = registry;

// ---------------------------------------------------------------- 配置
const SEED = "JIANGHU-S1";
const PARTY = "PLAYER1";
const ENTRANCE_ID = 1;
const SEAT = 1;
/** 锁定 golden：首次实跑取得 hash 后回填；非 null 时额外断言两次运行均 == 此值。
 *  E6 重锁说明（2026-08）：敌人类别 + 密度调整（DUNGEON_SPAWN_DENSITY 1.5→1.2 + count 区间 2..4→1..3）
 *  改变副本实例的敌人数量 → simRng 散点/掉装流在 BOSS 死亡前被消费的序列变化 → BOSS 掉装
 *  （金/暗金 itemId+词缀）改变 → journal 哈希变化。普通怪场景（③④⑤/副本普通怪）与 BOSS
 *  hpSeq/phaseSeen 均与旧 golden 一致，仅 boss.drop 变化。属需求驱动重锁（报告已说明）。
 *  E20 重锁说明（2026-08）：BOSS 死亡不再直接掉地面 token，改刷「战利品宝箱」（EntityKind.CHEST，
 *  显示暗金 + ttl=CHEST_TTL_TICKS）→ journal 由 boss.drop 扩展为 boss.chest + boss.chestOpen
 *  （3-5 件恰 1 暗金 + 金/蓝 + 强化石×2）。BOSS hpSeq/phaseSeen 与旧 golden 一致，仅掉装段
 *  journal 形态变化（需求驱动：E20 仪式化掉装），故重锁。
 */
const GOLDEN_PLAYTEST_HASH =
  "c378602b622de61a0b2a5cdd2d09361bbb890b1f5715835d54a81339a22ccf61";

// ---------------------------------------------------------------- 结果收集
const checks = [];
function check(id, label, pass, detail) {
  checks.push({ id, label, pass: !!pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${id} — ${label}${detail ? "  (" + detail + ")" : ""}`);
}
function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

// ---------------------------------------------------------------- 工具
/** fake Conn：记录控制面/数据面（复用 connection-registry.test 模式，无真实 ws）。 */
function fakeConn(userId) {
  const sent = [];
  const binarySent = [];
  const conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload, opts) {
      if (opts?.binary) binarySent.push(payload);
      else sent.push(JSON.parse(payload));
    },
  };
  return { conn, sent, binarySent };
}

function findPlayer(w, seatId) {
  return w.actors().find((a) => a.ownerId === seatId);
}
function findBoss(w) {
  return w.actors().find((a) => a.kind === EntityKind.BOSS);
}
function findLoot(w) {
  return w.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND);
}

/** 把实体搬到角落（隔离战斗，避免杂兵干扰/长时战斗被围杀；同 dungeon-online 先例）。 */
function relocateToCorner(actor, cornerIndex) {
  const corners = [
    { x: 3 * TILE, y: 3 * TILE },
    { x: 36 * TILE, y: 3 * TILE },
    { x: 3 * TILE, y: 26 * TILE },
    { x: 36 * TILE, y: 26 * TILE },
  ];
  const c = corners[cornerIndex % corners.length];
  actor.x = c.x;
  actor.y = c.y;
  return c;
}

/** 在指定世界把玩家精确放到某位置（remove+add；幂等，确定性定位）。 */
function placePlayer(w, seatId, userId, pos) {
  w.removePlayer(seatId);
  w.addPlayer(seatId, userId, pos);
}

/**
 * 持续对目标敌人施放 SKILL（slot：0..3，SKILL1..SKILL4）直至死亡。
 * 每 tick enqueue 一次（C11 seq 单调），world 的 cd 门闸过滤无效施放。
 * @returns { died, hpChanges, phaseSeen } hpChanges=每次有效扣血后的 hp；phaseSeen=BOSS 首次 phase1 的 hp。
 */
function fightUntilDead(w, seqState, enemyId, slot, maxTicks) {
  let died = false;
  let hpChanges = [];
  let phaseSeen = null;
  for (let t = 0; t < maxTicks && !died; t++) {
    const e = w.actors().find((a) => a.id === enemyId);
    if (!e || e.hp <= 0) {
      died = true;
      break;
    }
    const hpBefore = e.hp;
    seqState.n += 1;
    w.enqueueInput(SEAT, { seq: seqState.n, tick: 0, action: InputAction.SKILL1 + slot, dir: 0 });
    w.step();
    const e2 = w.actors().find((a) => a.id === enemyId);
    const hpNow = e2 ? e2.hp : 0;
    if (hpNow !== hpBefore) hpChanges.push(hpNow);
    if (e2 && e2.kind === EntityKind.BOSS && e2.bossPhase === 1 && phaseSeen === null) {
      phaseSeen = hpNow;
    }
  }
  return { died, hpChanges, phaseSeen };
}

/**
 * E6 BOSS 战（aggressive BOSS 适配）：teleport-poke。
 * BOSS（tier 2）默认 aggressive —— 会索敌追击 + 接触攻击（80 dmg/12tick），站桩会被击杀。
 * 本函数每 96 tick 周期：把 BOSS 与玩家瞬移到固定角落 → 施放 SKILL（cd 命中即开火）
 * → 玩家瞬移出仇恨半径（BOSS IDLE）→ 等 cd 走完。全程玩家不进入接触范围 → 不受伤害，
 * 技能节奏与站桩版一致（cd 闸门 96 tick/发）→ hpSeq/phaseSeen 与锁定 golden 结构相同；
 * 仅 BOSS 掉落（simRng 流，随 E6 密度调整变化）需重锁 golden（见报告说明）。
 * 注：依赖 ENEMY_MOVE_SPEED=8px/tick < 12px/tick（接触 48px 内一 tick 内不被追进），
 *     若未来敌人速度上调超过 12px/tick，需同步调整本函数的开火间距。
 */
function bossFightPoke(w, seqState, bossId, slot, maxTicks) {
  const corner = { x: 3 * TILE, y: 26 * TILE }; // corner 2（与旧版一致）
  const park = { x: -10 * TILE, y: -10 * TILE }; // 地图外停车位：任何敌人距其 >240px → BOSS IDLE
  const cd = SKILL_CD_BY_SLOT[slot]; // slot3 cd=96
  let died = false;
  let hpChanges = [];
  let phaseSeen = null;
  let ticks = 0;
  while (ticks < maxTicks && !died) {
    const e = w.actors().find((a) => a.id === bossId);
    if (!e || e.hp <= 0) {
      died = true;
      break;
    }
    const player = findPlayer(w, SEAT);
    if (!player) break;
    // ① 瞬移到固定角落：BOSS 在 corner，玩家在 corner+60（技能射程 72 内、接触 48 外）。
    e.x = corner.x;
    e.y = corner.y;
    player.x = corner.x + 60;
    player.y = corner.y;
    const hpBefore = e.hp;
    seqState.n += 1;
    w.enqueueInput(SEAT, { seq: seqState.n, tick: 0, action: InputAction.SKILL1 + slot, dir: 0 });
    w.step();
    const e2 = w.actors().find((a) => a.id === bossId);
    const hpNow = e2 ? e2.hp : 0;
    if (hpNow !== hpBefore) hpChanges.push(hpNow);
    if (e2 && e2.kind === EntityKind.BOSS && e2.bossPhase === 1 && phaseSeen === null) {
      phaseSeen = hpNow;
    }
    ticks++;
    // ② 命中后（cd 已重置为 96）：玩家瞬移出仇恨半径 → BOSS IDLE → 等 cd 走完（95 tick 后归零）。
    if (hpNow !== hpBefore && hpNow > 0) {
      const p2 = findPlayer(w, SEAT);
      p2.x = park.x;
      p2.y = park.y;
      for (let i = 0; i < cd - 1 && ticks < maxTicks; i++) {
        w.step();
        ticks++;
      }
    }
  }
  return { died, hpChanges, phaseSeen };
}

/**
 * 核心循环垂直切片（完全同步）：
 *   ① 加入 RESIDENT → ② 移动 → ③④⑤ 战斗/掉装/拾取（独立 sim world，同 world.step 代码）
 *   → ⑥ 进副本（protocol dungeon.enter）→ ⑦ 副本战斗（普通+BOSS，phase→死→必掉）
 *   → ⑧ 出本（protocol dungeon.exit，回主世界安全区）。
 * @param verbose  true=打印并收集本 run 的检查点（首跑）；false=仅产 journal（复跑，供 D9 比对）。
 * 返回确定性 journal（整数/字符串），供 sha256。
 */
function runCanonical(verbose = true) {
  const journal = [];

  // ---------------- ① 加入 RESIDENT（真实 room.join 协议路径）----------------
  bootResidentRun(SEED + "-resident"); // 真实 RESIDENT run；同步切片期间 loop 不抢占 → serverTick=0
  const fc = fakeConn(PARTY);
  registerConnection(fc.conn);
  const connId = fc.conn.connId;
  const joinRes = dispatch(
    { userId: PARTY, connId, seatId: SEAT, roomId: null },
    { type: "room.join", requestId: "j1" },
  );
  const joinOk = joinRes.reply?.type === "room.join.ok" && joinRes.roomId === RESIDENT_ROOM_ID;
  setRoom(connId, RESIDENT_ROOM_ID);
  addPlayerToRoom(RESIDENT_ROOM_ID, SEAT, PARTY);
  const resident = getWorld(RESIDENT_ROOM_ID);
  const p0 = findPlayer(resident, SEAT);
  if (verbose) {
    check(
      "join-resident",
      "① 加入 RESIDENT：room.join.ok + 玩家实体进主世界",
      joinOk && !!p0,
      `roomId=${joinRes.roomId} player@(${round2(p0?.x)},${round2(p0?.y)})`,
    );
  }
  journal.push({ step: "join", roomId: RESIDENT_ROOM_ID, p0: [round2(p0?.x), round2(p0?.y)] });

  // ---------------- ② 移动（真实 world.step 处理 MOVE）----------------
  const x0 = p0.x;
  let seq = 0;
  for (let t = 1; t <= 5; t++) {
    seq += 1;
    enqueueInput(RESIDENT_ROOM_ID, SEAT, { seq, tick: t, action: InputAction.MOVE, dir: 0 });
    resident.step();
    const cur = findPlayer(resident, SEAT);
    journal.push({ t, x: Math.round(cur.x), y: Math.round(cur.y) });
  }
  const x5 = findPlayer(resident, SEAT).x;
  const perTick = (x5 - x0) / 5;
  if (verbose) {
    check(
      "move-e",
      "② 移动：MOVE dir=0 → 每 tick 位移 ≈ CELLS_PER_TICK*TILE=16px",
      Math.abs(perTick - 16) < 0.01,
      `Δx/5tick=${round2(perTick)}px/tick (期望 ~16)`,
    );
  }

  // ---------------- ③④⑤ 战斗 / 掉装 / 拾取（独立 sim world + spawnZones）----------------
  const combatSeed = SEED + "-combat";
  const zonePos = { x: 20 * TILE, y: 15 * TILE };
  const combat = createWorld({
    runId: "PLAYTEST-COMBAT",
    roomId: "playtest-combat",
    seed: combatSeed,
    phase: RoomPhase.OVERWORLD,
    lootTokens: 0, // 无环境掉落，LOOT_GROUND 仅来自击杀（隔离掉装断言）
    spawnZones: [{ pos: zonePos, tier: 0, enemyTypeId: "savage", count: 8, respawnTicks: 100000 }],
  });
  combat.addPlayer(SEAT, PARTY, zonePos);
  const seqC = { n: 0 };
  const enemyKillLog = [];
  let drop = null;
  let dropPos = null;
  let kills = 0;
  // 逐个击杀普通敌人直至出现地面掉落（normal 掉率 0.3，确定性；预算 8 只）。
  for (let k = 0; k < 8 && !drop; k++) {
    const target = combat.actors().find((a) => a.kind === EntityKind.ENEMY && a.hp > 0);
    if (!target) break;
    const c = relocateToCorner(target, 0);
    placePlayer(combat, SEAT, PARTY, { x: c.x + 60, y: c.y });
    const kill = fightUntilDead(combat, seqC, target.id, 0, 100); // SKILL1: 20 dmg ×2 > 30hp
    kills += 1;
    enemyKillLog.push(kill.hpChanges);
    if (!kill.died) break;
    const loots = findLoot(combat);
    if (loots.length > 0) {
      drop = loots[0].loot;
      dropPos = { x: loots[0].x, y: loots[0].y };
    }
  }
  if (verbose) {
    check(
      "combat-kill",
      "③ 战斗：SKILL 击杀刷怪区普通敌人（hp 扣减→死亡）",
      kills >= 1 && enemyKillLog[0]?.length >= 1,
      `击杀 ${kills} 只；首个 hp 序列=[${(enemyKillLog[0] ?? []).join(",")}] (30→…→0)`,
    );
  }
  const dropLegal =
    !!drop &&
    drop.rarity >= 0 && drop.rarity <= 3 &&
    drop.affixes.length >= 0 && drop.affixes.length <= 5 &&
    drop.ttlTicks === LOOT_GROUND_TTL_TICKS;
  if (verbose) {
    check(
      "loot-drop",
      "④ 掉装：敌人死亡 → LOOT_GROUND 出现（rarity/词缀/ttl 合法）",
      !!drop && dropLegal,
      drop
        ? `itemId=${drop.itemId} rarity=${drop.rarity} affixes=[${drop.affixes.join(",")}] ttl=${drop.ttlTicks} (期望 ttl=${LOOT_GROUND_TTL_TICKS})`
        : "8 只内未出掉落（normal 掉率 0.3，此 seed 下不应发生）",
    );
  }
  journal.push({ step: "combat", kills, hpSeq: enemyKillLog[0] ?? [], drop: drop ?? null });
  if (drop) journal.push({ step: "drop-hash", dropHash: sha256(JSON.stringify(drop)) });

  // ⑤ 拾取：玩家与地面掉落重叠 → 拾取事件（world.consumePickups 暴露）。
  let pickupItemId = null;
  if (drop && dropPos) {
    placePlayer(combat, SEAT, PARTY, dropPos);
    combat.step();
    const events = combat.consumePickups();
    pickupItemId = events.find((ev) => ev.seatId === SEAT && ev.loot.itemId === drop.itemId)?.loot.itemId ?? null;
  }
  if (verbose) {
    check(
      "pickup",
      "⑤ 拾取：玩家与地面掉落重叠 → 拾取事件匹配 itemId",
      pickupItemId === drop?.itemId,
      `拾取 itemId=${pickupItemId} (期望 ${drop?.itemId})`,
    );
  }
  journal.push({ step: "pickup", itemId: pickupItemId });

  // ---------------- ⑥ 进副本（真实 protocol dungeon.enter → run-manager.enterInstance）----------------
  // 同步切片保证 RESIDENT loop 未抢占 → serverTick=0 → seed 字节级确定。
  const residentTickAfterMove = getWorld(RESIDENT_ROOM_ID).tick;
  const enterRes = dispatch(
    { userId: PARTY, connId, seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e1", payload: { entranceId: ENTRANCE_ID } },
  );
  const enterOk = enterRes.reply?.type === "dungeon.enter.ok";
  const instId = enterRes.roomId;
  const isInst = typeof instId === "string" && instId.startsWith("inst_") && instId !== RESIDENT_ROOM_ID;
  setRoom(connId, instId);
  // C-Dgn-2 成员锁定 + C-Net-2 原子切域 + C-Dgn-1 派生一致（serverTick=0 证明）。
  const instRoom = getInstanceRoom(instId);
  const seedExpected = computeInstanceSeed(0, ENTRANCE_ID, PARTY).toString();
  const instWorld = getWorld(instId);
  const enterChecks =
    enterOk && isInst &&
    isInstanceRunning(instId) &&
    !!instRoom && instRoom.locked && instRoom.members.size === 1 && isMember(instId, PARTY) &&
    fc.conn.roomId === instId &&
    !!instWorld && instWorld.phase === RoomPhase.DUNGEON &&
    instWorld.seed === seedExpected &&
    residentTickAfterMove === 5; // 手动 5 步，loop 未抢占 → 确定性前提成立
  const boss = findBoss(instWorld);
  const bossHp0 = boss?.hp ?? -1;
  if (verbose) {
    check(
      "enter-dungeon",
      "⑥ 进副本：dungeon.enter.ok + 实例创建 + 成员锁定 + 原子切域 + seed 派生一致",
      enterChecks,
      `roomId=${instId} members=${instRoom?.members.size} connRoom=${fc.conn.roomId} ` +
        `instSeed=${instWorld?.seed === seedExpected ? "match(serverTick=0)" : instWorld?.seed} ` +
        `bossHp=${bossHp0} residentTick=${residentTickAfterMove}`,
    );
    // C-Net-1：进本后玩家实体已出主世界（域隔离）。
    check(
      "enter-domain-switch",
      "⑥b C-Net-1：进本后 RESIDENT world 不再持有该玩家实体（不混流）",
      !findPlayer(getWorld(RESIDENT_ROOM_ID), SEAT),
      "玩家实体已从主世界移除（实例域隔离）",
    );
  }
  journal.push({
    step: "enter",
    instSeed: instWorld?.seed ?? null, // 确定性指纹（roomId 为随机编排身份，不入 D9 哈希）
    bossHp0,
    residentTick: residentTickAfterMove,
  });

  // ---------------- ⑦ 副本战斗：普通敌人 + BOSS（phase → 死亡 → 必掉装）----------------
  const seqI = { n: 0 };
  // 击杀一个副本普通敌人（隔离到角落）。
  const normalEnemy = instWorld.actors().find((a) => a.kind === EntityKind.ENEMY);
  let normalKill = { died: false, hpChanges: [] };
  if (normalEnemy) {
    const c1 = relocateToCorner(normalEnemy, 1);
    placePlayer(instWorld, SEAT, PARTY, { x: c1.x + 60, y: c1.y });
    normalKill = fightUntilDead(instWorld, seqI, normalEnemy.id, 0, 100);
  }
  if (verbose) {
    check(
      "dungeon-normal-kill",
      "⑦ 副本战斗：击杀副本普通敌人（hp 扣减→死亡）",
      normalKill.died,
      `hp序列=[${normalKill.hpChanges.join(",")}]`,
    );
  }
  journal.push({ step: "dungeon-normal", hpSeq: normalKill.hpChanges });

  // 击杀 BOSS：E6 BOSS 默认 aggressive —— 站桩会被击杀，改用 teleport-poke 适配
  // （瞬移到角落开火 → 瞬移出仇恨半径等 cd；伤害节奏与锁定 golden 一致，hpSeq/phaseSeen 不变）。
  // E20：BOSS 死亡不再直接掉地面 token，改刷「战利品宝箱」（EntityKind.CHEST，显示暗金 + 5min）；
  // 开箱（INTERACT）→ 3-5 件（恰 1 暗金 + 金/蓝）+ 强化石×2 → 宝箱消失。journal 相应扩展（重锁 golden）。
  let bossFight = { died: false, hpChanges: [], phaseSeen: null };
  let bossChest = null;   // 宝箱实体（显示暗金 + ttl）
  let chestOpen = null;   // 开箱事件（items + stones）
  if (boss) {
    const c2 = relocateToCorner(boss, 2);
    placePlayer(instWorld, SEAT, PARTY, { x: c2.x + 60, y: c2.y });
    bossFight = bossFightPoke(instWorld, seqI, boss.id, 3, 1000); // SKILL4 slot=3, cd96
    // E20：宝箱出现在 BOSS 死亡点附近（kind=CHEST；loot 承载显示暗金 + ttl）。
    const chest = instWorld.actors().find(
      (a) => a.kind === EntityKind.CHEST && Math.abs(a.x - c2.x) < TILE && Math.abs(a.y - c2.y) < TILE,
    );
    if (chest) {
      bossChest = {
        itemId: chest.loot.itemId,
        rarity: chest.loot.rarity,
        affixes: [...chest.loot.affixes],
        ttlTicks: chest.loot.ttlTicks,
      };
      // 开箱（INTERACT 目标宝箱）：玩家移到宝箱旁（距离 0 < CHEST_OPEN_RADIUS）→ 结算 → 宝箱消失。
      placePlayer(instWorld, SEAT, PARTY, { x: chest.x, y: chest.y });
      seqI.n += 1;
      instWorld.enqueueInput(SEAT, { seq: seqI.n, tick: 0, action: InputAction.INTERACT, dir: 0, targetEntityId: chest.id });
      instWorld.step();
      const opens = instWorld.consumeChestOpens();
      if (opens.length > 0) {
        chestOpen = {
          stones: opens[0].stones,
          items: opens[0].items.map((i) => ({ itemId: i.itemId, rarity: i.rarity, affixes: [...i.affixes] })),
        };
      }
    }
  }
  const bossPhaseOk =
    bossFight.died &&
    bossFight.phaseSeen !== null &&
    bossFight.phaseSeen < ENEMY_BASE_HP * HP_MULT.boss * BOSS_PHASE_THRESHOLD;
  const bossChestOk =
    !!bossChest &&
    bossChest.rarity === 3 &&                      // 显示必含暗金
    bossChest.affixes.length === 5 &&              // 暗金恒 5 词缀
    bossChest.ttlTicks === CHEST_TTL_TICKS - 1;    // 5min（死亡 tick 的 (6b) 段已递减 1）
  const chestOpenOk =
    !!chestOpen &&
    chestOpen.items.length >= 3 && chestOpen.items.length <= 5 && // 3-5 件
    chestOpen.items.filter((i) => i.rarity === 3).length === 1 && // 恰 1 暗金
    chestOpen.items.every((i) => i.rarity === 3 || i.rarity === 1 || i.rarity === 2) && // 其余金/蓝
    chestOpen.stones === CHEST_STONES &&           // 强化石×2
    !instWorld.actors().some((a) => a.kind === EntityKind.CHEST); // 开箱后宝箱消失
  if (verbose) {
    check(
      "boss-kill-phase",
      "⑦b BOSS：击杀 + phase 推进（hp 跨 50% 阈值）",
      bossPhaseOk,
      `hp序列=[${bossFight.hpChanges.join(",")}]；phase 首现 hp=${bossFight.phaseSeen} (<${ENEMY_BASE_HP * HP_MULT.boss * BOSS_PHASE_THRESHOLD})`,
    );
    check(
      "boss-chest",
      "⑦c E20 BOSS 掉装仪式化：死亡刷战利品宝箱（显示暗金 + ttl=5min）",
      bossChestOk,
      bossChest
        ? `itemId=${bossChest.itemId} rarity=${bossChest.rarity} affixes=[${bossChest.affixes.join(",")}] ttl=${bossChest.ttlTicks} (期望 ${CHEST_TTL_TICKS - 1})`
        : "BOSS 未刷宝箱（违反 E20 必刷）",
    );
    check(
      "boss-chest-open",
      "⑦d E20 开箱：3-5 件（恰 1 暗金 + 金/蓝）+ 强化石×2 + 宝箱消失",
      chestOpenOk,
      chestOpen
        ? `stones=${chestOpen.stones} items=${chestOpen.items.length} 暗金=${chestOpen.items.filter((i) => i.rarity === 3).length} rarities=[${chestOpen.items.map((i) => i.rarity).join(",")}]`
        : "开箱未产生 ChestOpenEvent",
    );
  }
  journal.push({
    step: "boss",
    hpSeq: bossFight.hpChanges,
    phaseSeen: bossFight.phaseSeen,
    chest: bossChest ? { itemId: bossChest.itemId, rarity: bossChest.rarity, affixes: bossChest.affixes, ttlTicks: bossChest.ttlTicks } : null,
    chestOpen: chestOpen ? { stones: chestOpen.stones, items: chestOpen.items } : null,
  });

  // ---------------- ⑧ 出本（真实 protocol dungeon.exit → run-manager.exitInstance）----------------
  const exitRes = dispatch(
    { userId: PARTY, connId, seatId: SEAT, roomId: instId },
    { type: "dungeon.exit", requestId: "x1" },
  );
  const exitOk = exitRes.reply?.type === "dungeon.exit.ok" && exitRes.roomId === RESIDENT_ROOM_ID;
  setRoom(connId, RESIDENT_ROOM_ID);
  const pBack = findPlayer(getWorld(RESIDENT_ROOM_ID), SEAT);
  const backAtSafe =
    !!pBack &&
    Math.round(pBack.x) === RESPAWN_POS.x &&
    Math.round(pBack.y) === RESPAWN_POS.y;
  if (verbose) {
    check(
      "exit-dungeon",
      "⑧ 出本：dungeon.exit.ok + 实例解散 + 玩家回主世界安全区",
      exitOk && fc.conn.roomId === RESIDENT_ROOM_ID && !isInstanceRunning(instId) && getRoom(instId) === null && backAtSafe,
      `connRoom=${fc.conn.roomId} instAlive=${isInstanceRunning(instId)} ` +
        `playerBack=(${round2(pBack?.x)},${round2(pBack?.y)}) (安全区 ${RESPAWN_POS.x},${RESPAWN_POS.y})`,
    );
  }
  journal.push({ step: "exit", instAlive: isInstanceRunning(instId), pBack: pBack ? [round2(pBack.x), round2(pBack.y)] : null });

  return { journal, hash: sha256(JSON.stringify(journal)) };
}

// ================================================================ 主流程
console.log("");
console.log("══════════════════════════════════════════════════════════════");
console.log("  核心循环 headless 可玩性验证台 (jianghu E1–E5 垂直切片)");
console.log(`  seed=${SEED} party=${PARTY} entrance=${ENTRANCE_ID}`);
console.log("══════════════════════════════════════════════════════════════");
console.log("");

console.log("[a] 运行垂直切片（首跑：采集遥测 + 逐项断言）...");
const r1 = runCanonical(true);
console.log("");
console.log("[b] 重跑（复跑：同 seed + 同步切片，验证 D9 字节级相等）...");
const r2 = runCanonical(false);

// ---- D9 确定性 ----
const mutualEqual = r1.hash === r2.hash;
let detDetail = `两次 hash 字节级相等=${mutualEqual}（r1=${r1.hash.slice(0, 24)}…）`;
let detPass = mutualEqual;
if (GOLDEN_PLAYTEST_HASH !== null) {
  const matchGolden = r1.hash === GOLDEN_PLAYTEST_HASH;
  detDetail += `；锁定 golden 匹配=${matchGolden}`;
  detPass = mutualEqual && matchGolden;
} else {
  detDetail += `；[GOLDEN 尚未回填，仅校验互等]`;
}
check("D9-determinism", "确定性：同 seed+输入 → 同 journal sha256", detPass, detDetail);

// ================================================================ 汇总
const passed = checks.filter((c) => c.pass).length;
const failed = checks.length - passed;
console.log("");
console.log("──────────────── 验证门结论 ────────────────");
const allPass = failed === 0;
console.log(`  核心循环机械闭环：${allPass ? "成立 (PASS)" : "不成立 (FAIL)"}`);
console.log(`  检查项：${checks.length}  通过：${passed}  失败：${failed}`);
console.log(`  确定性 journal hash (本次观测): ${r1.hash}`);
console.log("────────────────────────────────────────────");

if (!allPass) {
  console.error("\n[FATAL] 存在失败项，验证门未通过。");
  process.exit(1);
}
console.log("\n[OK] 全部通过，核心循环机械闭环验证成立。");
process.exit(0);
