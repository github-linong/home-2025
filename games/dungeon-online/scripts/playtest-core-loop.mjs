/**
 * playtest-core-loop.mjs — 核心循环机械闭环 · headless 可玩性验证台
 *
 * 目的：作为用户已批准的「好玩吗」验证门的形式化证据，验证 E1+E3+E4+E5
 *       核心循环（权威模拟）在 headless 下机械闭环成立。
 *
 * 约束：本脚本是 **独立的验证工具**，不修改 sim-core/src、dungeon-server/src
 *       任何运行时代码，仅动态 import 其 .ts 模块做断言。
 *
 * 运行：node --experimental-strip-types scripts/playtest-core-loop.mjs
 *       退出码 0 = 全部通过；非 0 = 存在失败项。
 *
 * 覆盖的控制项：O2（移动接管）/ D12（telegraph 前摇）/ O-M（DODGE i-frame 解冻回归）
 *               / C11（服务端权威伤害，拒伪造 amount）/ D9（确定性 golden）/ C6（seq 单调）
 *               诚实未覆盖项见 production/playtest-core-loop-report.md。
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

// 相对本脚本解析 sim-core .ts 模块路径。
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../packages/sim-core/src");

const world = await import(resolve(SRC, "world.ts"));
const types = await import(resolve(SRC, "types.ts"));
const combat = await import(resolve(SRC, "combat.ts"));

const { createWorld } = world;
const { InputAction, EntityStatus, EntityKind, CLASS_BASE, ENEMY_PROTOTYPES } = types;
const {
  resolveDamage,
  PLAYER_ATTACK_DAMAGE,
  DODGE_IFRAME_TICKS,
  MIN_TELEGRAPH_TICKS,
  CombatKind,
} = combat;

// ---------------------------------------------------------------- 配置
const SEED = "EMBER-S1";
const BIOME = 0;
const MAX_TICKS = 220; // 约 200+ tick 脚本化序列
// 锁定 golden：首次实跑取得 hash 后回填；非 null 时额外断言三次运行均 == 此值。
// E6 重锁说明：E6 敌人 AI 接入后敌人移速由占位 1px/tick 改为 ENEMY_PROTOTYPES.speed/30
// （确定性），runCanonical 固定序列下敌人坐标变化 → 哈希改变；三次运行字节相等（确定性 intact），重锁。
// WEB-FEEL 重锁说明：调宽玩家/怪物速度差（玩家 ×1.5、敌人 ×0.63，仅 speed/moveSpeed 字段），
// 玩家与敌人坐标变化 → 哈希随之改变；确定性未破坏（三次运行字节相等），故再次重锁本值。
// N2+掉落 重锁说明：N2 使敌人/玩家移动时更新 Actor.dir（朝向 0-7），方向性 telegraph 的 dir
//   单位向量随实时移动而变；且本场景击杀杂兵 → 确定性生成掉落实体（loot kind=6）进入快照 entities
//   → 哈希改变；确定性未破坏（三次运行字节相等），故重锁本值。
// caster_ember 重锁说明：dungeon-gen 注入 caster_ember → 首只 ENEMY 可能为 caster_ember
//   （hp 40–80/speed 55/attackRange 175/shape LINE），且 rng 抽流漂移使 enemy 坐标变化
//   → 快照哈希改变；三次运行字节级相等（确定性 intact），故重锁本值。
const GOLDEN_PLAYTEST_HASH =
  "87e1a7aba486f3b3081ca410b4411efdb82f9daf2c344ceb9336f719f89eb16f";

// ---------------------------------------------------------------- 结果收集
const checks = [];
function check(id, label, pass, detail) {
  checks.push({ id, label, pass: !!pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${id} — ${label}${detail ? "  (" + detail + ")" : ""}`);
}
function approx(a, b) {
  return Math.abs(a - b) < 1e-6;
}

// ---------------------------------------------------------------- 工具
function hashEntities(entities) {
  return createHash("sha256").update(JSON.stringify(entities)).digest("hex");
}

/** 构造 2 名玩家（tank+ranger）的世界，并定位首个 grunt（杂兵，hp 30–60，可在预算内击倒）。 */
function mkWorld() {
  const w = createWorld({
    runId: "PLAYTEST-CORE-LOOP",
    seed: SEED,
    biomeId: BIOME,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });
  const actors = w.actors();
  const p0 = actors.find((a) => a.ownerId === 0); // tank
  const p1 = actors.find((a) => a.ownerId === 1); // ranger
  const grunt = actors.find((a) => a.enemyTypeId === "grunt_swarm");
  if (!grunt) throw new Error("seed " + SEED + " biome " + BIOME + " 未产出 grunt，无法验证击倒");
  const combatMap = new Map(actors.map((a) => [a.id, a])); // 活体引用，resolveDamage 直接落回
  return { w, p0, p1, grunt, combatMap };
}

/**
 * 核心循环集成场景：~220 tick 脚本化输入序列
 *   player0(tank) 朝 +x 移动 → tick0 发起 ATTACK(对 grunt) → tick30 发起 DODGE
 *   → tick36（dodge 窗口内）由敌人经 resolveDamage 对 player0 施加一次攻击(amount=999)
 *   → 持续步进，并在 tick 40/80/120/160 补 ATTACK 直至击倒 grunt。
 *   player1(ranger) 每 tick 朝 +y 移动（验证不同职业速率）。
 * 返回最终快照 entities 的 sha256 与采集到的遥测点。
 */
function runCanonical() {
  const { w, p0, p1, grunt, combatMap } = mkWorld();
  const gruntId = grunt.id;
  const tele = {
    enemyHpBefore: grunt.hp,
    p0x10: 0, p0x20: 0, p1y10: 0, p1y20: 0,
    windup: null,
    enemyHpAt18: null, enemyHpAt19: null,
    p0HpBeforeHit: null, p0HpAfterHit: null,
    p0IframeAt44: null, p0x44: 0, p0x50: 0,
    enemyHpFinal: null, enemyStatusFinal: null,
  };
  let p0seq = 0;
  let p1seq = 0;
  const p0Dir = { x: 1, y: 0 };

  for (let t = 0; t < MAX_TICKS; t++) {
    // --- player0 输入（固定计划，确定性）---
    let p0cmd;
    if (t === 0) p0cmd = { action: InputAction.ATTACK, target: gruntId };
    else if (t === 30) p0cmd = { action: InputAction.DODGE };
    else if (t === 40 || t === 80 || t === 120 || t === 160)
      p0cmd = { action: InputAction.ATTACK, target: gruntId };
    else p0cmd = { action: InputAction.MOVE, dir: p0Dir };
    p0seq++;
    const ok0 = w.enqueueInput(0, {
      seq: p0seq,
      tick: t,
      action: p0cmd.action,
      dir: p0cmd.dir || { x: 0, y: 0 },
      target: p0cmd.target,
    });
    if (!ok0) throw new Error("C11 rejected player0 seq=" + p0seq + " at tick " + t);

    // --- player1 输入（每 tick 移动，C11 seq 单调）---
    p1seq++;
    const ok1 = w.enqueueInput(1, {
      seq: p1seq,
      tick: t,
      action: InputAction.MOVE,
      dir: { x: 0, y: 1 },
    });
    if (!ok1) throw new Error("C11 rejected player1 seq=" + p1seq + " at tick " + t);

    // --- 确定性副作用：dodge 窗口内（tick36）敌人经 resolveDamage 对 player0 施加一次攻击 ---
    // 模拟「恶意/敌方伤害请求」：amount=999（巨大），若 C11 未生效本应造成大量扣血；
    // 此处因 player0 处于 i-frame 窗口，伤害应被完全抵消（deltaHp=0）。
    if (t === 36) {
      tele.p0HpBeforeHit = p0.hp;
      resolveDamage(
        { tick: w.tick, entities: combatMap },
        { sourceId: gruntId, targetId: p0.id, amount: 999, tick: w.tick, kind: CombatKind.ATTACK },
      );
      tele.p0HpAfterHit = p0.hp;
    }

    w.step();

    // --- 遥测采集（按 world.tick 定点）---
    if (w.tick === 1 && p0.telegraph)
      tele.windup = p0.telegraph.applyTick - p0.telegraph.startTick;
    if (w.tick === 10) { tele.p0x10 = p0.x; tele.p1y10 = p1.y; }
    if (w.tick === 20) { tele.p0x20 = p0.x; tele.p1y20 = p1.y; }
    if (w.tick === 18) tele.enemyHpAt18 = grunt.hp;
    if (w.tick === 19) tele.enemyHpAt19 = grunt.hp;
    if (w.tick === 44) { tele.p0IframeAt44 = p0.status; tele.p0x44 = p0.x; }
    if (w.tick === 50) tele.p0x50 = p0.x;
  }

  tele.enemyHpFinal = grunt.hp;
  tele.enemyStatusFinal = grunt.status;
  return { hash: hashEntities(w.snapshot().entities), tele };
}

// ================================================================ 主流程
console.log("");
console.log("══════════════════════════════════════════════════════════════");
console.log(" 核心循环 headless 可玩性验证台 (E1+E3+E4+E5)");
console.log(" seed=" + SEED + " biome=" + BIOME + " ticks=" + MAX_TICKS);
console.log("══════════════════════════════════════════════════════════════");
console.log("");

console.log("[a] 运行集成场景（采集遥测 + 确定性基线）...");
const run = runCanonical();
const tele = run.tele;
console.log("");

// ---- (a) O2 移动接管 ----
const tankRate = CLASS_BASE.tank.moveSpeed / 30;
const rangerRate = CLASS_BASE.ranger.moveSpeed / 30;
const p0rate = (tele.p0x20 - tele.p0x10) / 10;
const p1rate = (tele.p1y20 - tele.p1y10) / 10;
check(
  "O2-move",
  "移动速率 = CLASS_BASE[classId].moveSpeed / 30（O2 接管）",
  approx(p0rate, tankRate) && approx(p1rate, rangerRate),
  `tank=${p0rate.toFixed(4)} (期望 ${tankRate.toFixed(4)}) px/tick；` +
    `ranger=${p1rate.toFixed(4)} (期望 ${rangerRate.toFixed(4)}) px/tick`,
);

// ---- (b) D12 telegraph 前摇 18 tick ----
const hpBefore = tele.enemyHpBefore;
check(
  "D12-telegraph",
  "ATTACK 前摇 ≥ MIN_TELEGRAPH_TICKS(18)：结算前 hp 不变、之后才扣血",
  tele.windup === MIN_TELEGRAPH_TICKS &&
    tele.enemyHpAt18 === hpBefore &&
    tele.enemyHpAt19 === hpBefore - PLAYER_ATTACK_DAMAGE,
  `windup=${tele.windup} tick；enemyHp@tick18=${tele.enemyHpAt18} (==发起前 ${hpBefore})；` +
    `enemyHp@tick19=${tele.enemyHpAt19} (-${PLAYER_ATTACK_DAMAGE})`,
);

// ---- (c) O-M DODGE i-frame 回归 ----
const dodgedHit = tele.p0HpBeforeHit === tele.p0HpAfterHit;
const iframeCleared = (tele.p0IframeAt44 & EntityStatus.IFRAME) === 0;
const movesAfter = tele.p0x50 > tele.p0x44;
check(
  "O-M-dodge",
  "DODGE i-frame：窗口内免伤 + 窗口后位清除 + 玩家不被冻结",
  dodgedHit && iframeCleared && movesAfter,
  `窗口内受击 hp ${tele.p0HpBeforeHit}->${tele.p0HpAfterHit} (不变=${dodgedHit})；` +
    `iframe位@tick44=${(tele.p0IframeAt44 & EntityStatus.IFRAME) >>> 0}；` +
    `窗口后仍可移动=${movesAfter} (x ${tele.p0x44.toFixed(1)}->${tele.p0x50.toFixed(1)})`,
);

// ---- (d) C11 伪造 amount 被拒（服务端权威伤害）----
{
  const { w, grunt: g, combatMap: m, p0: src } = mkWorld();
  // 模拟「客户端伪造巨额伤害」：amount=9999 vs amount=0，均应裁决为 PLAYER_ATTACK_DAMAGE=18。
  const evBig = resolveDamage(
    { tick: w.tick, entities: m },
    { sourceId: src.id, targetId: g.id, amount: 9999, tick: w.tick, kind: CombatKind.ATTACK },
  );
  const evZero = resolveDamage(
    { tick: w.tick, entities: m },
    { sourceId: src.id, targetId: g.id, amount: 0, tick: w.tick, kind: CombatKind.ATTACK },
  );
  const dropped = g.maxHp - g.hp;
  check(
    "C11-amount",
    "DamageRequest.amount 被忽略，服务端恒裁 -18（与 amount 无关）",
    evBig.deltaHp === -PLAYER_ATTACK_DAMAGE &&
      evZero.deltaHp === -PLAYER_ATTACK_DAMAGE &&
      dropped === 2 * PLAYER_ATTACK_DAMAGE,
    `amount=9999 -> deltaHp=${evBig.deltaHp}；amount=0 -> deltaHp=${evZero.deltaHp}；` +
      `两者均 == -${PLAYER_ATTACK_DAMAGE}`,
  );
}

// ---- (e) 敌人可被击倒 ----
const downed = (tele.enemyStatusFinal & EntityStatus.DOWNED) !== 0 && tele.enemyHpFinal === 0;
check(
  "enemy-down",
  "持续攻击使敌人 hp≤0 → DOWNED 位置位、hp 钳 0",
  downed,
  `finalHp=${tele.enemyHpFinal}；status=0b${(tele.enemyStatusFinal).toString(2)} ` +
    `(DOWNED位=${(tele.enemyStatusFinal & EntityStatus.DOWNED) !== 0})`,
);

// ---- (e2) O-E 闭合：真实敌人 AI 经 D12 前摇→resolveDamage 对玩家造成伤害（非手动打桩）----
{
  const { w, p0, grunt } = mkWorld();
  // 将 grunt 经活引用搬到玩家身旁（进入攻击范围；不依赖布局距离，隔离 E6 敌人 AI 路径）。
  grunt.x = p0.x + 5;
  grunt.y = p0.y;
  const hpBefore = p0.hp;
  // 无玩家输入 → 玩家静止；敌人持续贴近并在 grunt.telegraphTicks(21) 后经 ⑦ 结算。
  for (let t = 0; t < 30; t++) w.step();
  const dropped = hpBefore - p0.hp;
  check(
    "O-E-enemy-ai",
    "敌人 AI 经 D12 前摇对玩家造成原型伤害（闭合 O-E，敌我伤害分离）",
    dropped === ENEMY_PROTOTYPES.grunt_swarm.attackDamage && dropped !== PLAYER_ATTACK_DAMAGE,
    `玩家 hp ${hpBefore}->${p0.hp}（敌人造成 -${dropped}，= 原型 ${ENEMY_PROTOTYPES.grunt_swarm.attackDamage}，≠ 玩家 ${PLAYER_ATTACK_DAMAGE}）`,
  );
}

// ---- (f) D9 确定性 ----
console.log("");
console.log("[f] 确定性：相同 seed + 完全相同输入序列重跑 3 次...");
const r1 = runCanonical();
const r2 = runCanonical();
const r3 = runCanonical();
const mutualEqual = r1.hash === r2.hash && r2.hash === r3.hash;
let detail = `hash=${r1.hash.slice(0, 24)}…；三次运行字节级相等=${mutualEqual}`;
let pass = mutualEqual;
if (GOLDEN_PLAYTEST_HASH !== null) {
  const matchGolden = r1.hash === GOLDEN_PLAYTEST_HASH;
  detail += `；锁定 golden 匹配=${matchGolden}`;
  pass = mutualEqual && matchGolden;
} else {
  detail += `；[GOLDEN 尚未回填，仅校验互等]`;
}
check("D9-determinism", "确定性：同 seed+输入 → 同世界哈希（sha256）", pass, detail);

// ================================================================ 汇总
const passed = checks.filter((c) => c.pass).length;
const failed = checks.length - passed;
console.log("");
console.log("──────────────── 验证门结论 ────────────────");
const allPass = failed === 0;
console.log(`  核心循环机械闭环：${allPass ? "成立 (PASS)" : "不成立 (FAIL)"}`);
console.log(`  检查项：${checks.length}  通过：${passed}  失败：${failed}`);
console.log("  确定性 hash (本次观测): " + r1.hash);
console.log("────────────────────────────────────────────");

if (!allPass) {
  console.error("\n[FATAL] 存在失败项，验证门未通过。");
  process.exit(1);
}
console.log("\n[OK] 全部通过，核心循环机械闭环验证成立。");
process.exit(0);
