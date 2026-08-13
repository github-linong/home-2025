"use strict";
var __LocalSim = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // games/dungeon-online/packages/sim-core/src/world.ts
  var world_exports = {};
  __export(world_exports, {
    PERK_CATALOG: () => PERK_CATALOG,
    createWorld: () => createWorld
  });

  // games/dungeon-online/packages/sim-core/src/types.ts
  var SKILL_IDS = {
    SHIELD_ALLY: 0,
    // 护盾链接：给目标盟友施加减伤护盾窗口
    REVIVE_BOOST: 1,
    // 急救链：给倒地盟友救援读条直接加成（加速归队）
    TAUNT: 2,
    // 嘲讽战吼：施法者吸引敌火（敌人 AI 优先锁定）
    MARK: 3,
    // 猎手标记（C4b 游侠专属进攻技）：对敌人施加易伤窗口，标记期间受其伤害 ×1.25
    BARRAGE: 4
    // 术法弹幕（C4b 术士专属进攻技）：对敌人造成 22 点扁平伤害（SKILL 类，受 D12 前摇门控）
  };
  var CLASS_BASE = {
    // BAL-FIX 2026-08-11：HP 全体 +40%（tank 140→196 / ranger 80→112 / mage 90→126 / healer 100→140），
    // 解决「人太弱」——ranger 原 80 被 3 只 grunt(8/只) 围殴 4 轮即倒；buff 后 112 可扛 14 轮 grunt
    // 或 9 轮 elite(12/只)，给走位/协作留出反应时间。移速/攻速不变。
    // SLAUGHTER-FIX 2026-08-12：攻速 400→280ms（+35%），配合伤害 38 给「一刀一片」割草感。
    // 怪海（6-10/点）下玩家需更肉（HP +30%）才能在「碾压怪」而非「被围殴」时站得住。
    tank: { hp: 255, moveSpeed: 210, attackCooldownMs: 280, label: "\u5B88\u536B\u58EB" },
    ranger: { hp: 145, moveSpeed: 278, attackCooldownMs: 280, label: "\u6E38\u4FA0" },
    mage: { hp: 164, moveSpeed: 248, attackCooldownMs: 280, label: "\u672F\u58EB" },
    healer: { hp: 182, moveSpeed: 255, attackCooldownMs: 280, label: "\u533B\u8005" }
  };
  var CLASS_SKILLS = {
    tank: [SKILL_IDS.TAUNT, SKILL_IDS.SHIELD_ALLY],
    ranger: [SKILL_IDS.REVIVE_BOOST, SKILL_IDS.SHIELD_ALLY, SKILL_IDS.MARK],
    mage: [SKILL_IDS.TAUNT, SKILL_IDS.SHIELD_ALLY, SKILL_IDS.BARRAGE],
    healer: [SKILL_IDS.REVIVE_BOOST, SKILL_IDS.SHIELD_ALLY]
  };
  var EntityStatus = {
    ALIVE: 1 << 0,
    DOWNED: 1 << 1,
    // OUT = 1<<2：与 DOWNED 紧邻（2 的连续幂），语义上「本 run 出局/旁观」——可逆恢复（救援/
    // 超时）用 DOWNED，永久移除用 DEAD(1<<3)。OUT 与 DOWNED 互斥：超时未救 → 清 DOWNED 置 OUT；
    // OUT 仅由 ⑪ E7.S7.5 超时触发，绝不经由伤害结算（S7.4）；OUT 玩家本 run 作旁观，world reset 才清。
    OUT: 1 << 2,
    DEAD: 1 << 3,
    IFRAME: 1 << 4,
    STUN: 1 << 5,
    SLOW: 1 << 6,
    BUFF: 1 << 7
  };
  var EntityKind = {
    PLAYER: 0,
    ENEMY: 1,
    BOSS: 2,
    RESOURCE: 3,
    PROJECTILE: 4,
    TELEGRAPH: 5,
    // 掉落实体（progression/feedback；3/4/5 已被资源/弹幕/telegraph 占用，故取 6）。
    LOOT: 6
  };
  var RoomPhase = {
    LOBBY: 0,
    ACTIVE: 1,
    BOSS: 2,
    SETTLE: 3,
    RESIDENT: 4
  };
  var WAVE_INTERMISSION_TICKS = 90;
  var TelegraphShape = {
    RING: 0,
    AOE_FILL: 1,
    CONE: 2,
    LINE: 3
  };
  var DANGER_COLOR = 0;
  var ENEMY_PROTOTYPES = {
    grunt_swarm: {
      id: "grunt_swarm",
      tier: "grunt",
      // SLAUGHTER-FIX 2026-08-12：30-60→18-30（血量大降 → 玩家 38 一刀一个）；伤害 6→4（围攻不死）。
      hpMin: 18,
      hpMax: 30,
      attackDamageMin: 4,
      attackDamageMax: 7,
      attackDamage: 4,
      // SLAUGHTER-FIX: 6→4
      speed: 70,
      // 平衡初稿 px/s (WEB-FEEL: 110 → 70, 拉开与玩家差距)
      attackRange: 40,
      // 平衡初稿 px
      telegraphTicks: 21,
      // 0.7s @30Hz
      shape: TelegraphShape.RING
    },
    elite_warden: {
      id: "elite_warden",
      tier: "elite",
      // SLAUGHTER-FIX：120-200→45-70（3 刀）；伤害 10→7（不两下带走玩家）。
      hpMin: 45,
      hpMax: 70,
      attackDamageMin: 8,
      attackDamageMax: 12,
      attackDamage: 7,
      // SLAUGHTER-FIX: 10→7
      speed: 60,
      // 平衡初稿 px/s (WEB-FEEL: 95 → 60, 拉开与玩家差距)
      attackRange: 48,
      // 平衡初稿 px
      telegraphTicks: 24,
      // 0.8s @30Hz
      shape: TelegraphShape.AOE_FILL
    },
    caster_ember: {
      id: "caster_ember",
      tier: "elite",
      // SLAUGHTER-FIX：40-80→22-36（2 刀）；伤害 9→6。
      hpMin: 22,
      hpMax: 36,
      attackDamageMin: 6,
      attackDamageMax: 10,
      attackDamage: 6,
      // SLAUGHTER-FIX: 9→6
      speed: 55,
      // 平衡初稿 px/s（远程风筝者，略慢于近战精英）
      attackRange: 120,
      // RANGE-BALANCE: 175→120（下调远程射程，避免近战玩家被远程怪在屏幕边缘放风筝；仍远于近战怪 40-64）
      telegraphTicks: 24,
      // 0.8s @30Hz（精英下限）
      shape: TelegraphShape.LINE
      // 线性法术弹道（N2 方向性 telegraph）
    },
    boss_emberlord: {
      id: "boss_emberlord",
      tier: "boss",
      // SLAUGHTER-FIX：800-1500→350-550（12 刀≈8s 不拖沓）；伤害 18→14。
      hpMin: 350,
      hpMax: 550,
      attackDamageMin: 14,
      attackDamageMax: 24,
      attackDamage: 14,
      // SLAUGHTER-FIX: 18→14
      speed: 50,
      // 平衡初稿 px/s (WEB-FEEL: 80 → 50, 拉开与玩家差距)
      attackRange: 64,
      // 平衡初稿 px
      telegraphTicks: 30,
      // 1.0s @30Hz
      shape: TelegraphShape.CONE
    },
    brute_charger: {
      id: "brute_charger",
      tier: "grunt",
      // SLAUGHTER-FIX：35-55→20-30（1 刀）；伤害 10→6。
      hpMin: 20,
      hpMax: 30,
      attackDamageMin: 6,
      attackDamageMax: 10,
      attackDamage: 6,
      // SLAUGHTER-FIX: 10→6
      speed: 95,
      // 平衡初稿 px/s（明显快于 grunt 70 / elite 60 / boss 50）
      attackRange: 38,
      // 平衡初稿 px
      telegraphTicks: 18,
      // 0.6s @30Hz（最短下限 MIN_TELEGRAPH_TICKS，更激进的前摇）
      shape: TelegraphShape.RING
    },
    bomber_imp: {
      id: "bomber_imp",
      tier: "grunt",
      // SLAUGHTER-FIX：14-20→8-12（1 刀）；AOE 12→8。
      hpMin: 8,
      hpMax: 12,
      attackDamageMin: 0,
      // 自爆兵 AOE 为定值（非区间随机），Min/Max 置 0 以与③原型表字段一致
      attackDamageMax: 0,
      attackDamage: 8,
      // AOE 扁平伤害（SLAUGHTER-FIX: 12→8）
      speed: 135,
      // 平衡初稿 px/s（远超 grunt 70 / elite 60 / boss 50 / brute 95；高速脆皮冲锋）
      attackRange: 36,
      // 平衡初稿 px（= blast 半径：进入即起 telegraph，applyTick 时 AOE 结算）
      telegraphTicks: 18,
      // 0.6s @30Hz（D12 MIN_TELEGRAPH_TICKS 下限；消除 M13 刻意短前摇例外，与 brute 一致）
      shape: TelegraphShape.AOE_FILL
      // AOE 填充预警（已接线的客户端 telegraph 渲染路径）
    },
    gunner_imp: {
      id: "gunner_imp",
      tier: "grunt",
      // SLAUGHTER-FIX：18-26→10-16（1 刀）；伤害 9→6。
      hpMin: 10,
      hpMax: 16,
      attackDamageMin: 0,
      // 弹道命中伤害为扁平定值（非区间随机），Min/Max 置 0 与③原型表字段一致
      attackDamageMax: 0,
      attackDamage: 6,
      // 弹道命中伤害（SLAUGHTER-FIX: 9→6）
      speed: 90,
      // 平衡初稿 px/s（介于 grunt 70 与 bomber 135 之间，远程风筝者）
      attackRange: 110,
      // RANGE-BALANCE: 160→110（下调远程射程，避免近战玩家被远程怪在屏幕边缘放风筝；仍远于近战怪 40-64）
      telegraphTicks: 16,
      // 瞄准前摇 tick（抵达 applyTick 时 world 生成飞行弹道实体，非近战结算）
      shape: TelegraphShape.LINE
      // 线性瞄准预警（N2 方向性 telegraph，沿 facing 拉伸瞄准线）
    }
  };
  var RESOURCE_PROTOTYPES = {
    medkit_small: { id: "medkit_small", category: "medkit", magnitude: 40, durationTicks: 0 },
    ammo_pack: { id: "ammo_pack", category: "ammo", magnitude: 1, durationTicks: 0 },
    buff_rage: { id: "buff_rage", category: "buff", magnitude: 20, durationTicks: 90 }
    // +20% 攻 / 3s @30Hz
  };
  var PICKUP_RADIUS = 28;
  var LOOT_DROP_CHANCE = 0.5;
  var LOOT_MEDKIT_HEAL = 40;
  var LOOT_BUFF_MULT = 0.2;
  var LOOT_BUFF_PERCENT = 20;
  var LOOT_BUFF_TICKS = 90;
  var MAX_LOOT_ENTITIES = 40;
  var InputAction = {
    MOVE: 0,
    ATTACK: 1,
    DODGE: 2,
    SKILL: 3,
    SIGNAL: 4,
    CHOOSE_FLOOR: 5
    // ROUTE-PICK（P3）：层间路线选择（param=选项 idx，0..n-1）
  };
  var SkillTargetMode = {
    SELF: 0,
    // 仅施法者自身（如嘲讽：吸引敌火保护队友）
    ALLY: 1,
    // 必须是指定「其他玩家盟友」（护盾/急救链；不可指向自己或敌人）
    ENEMY: 2
    // 预留（未来进攻型协作技；本 Epic 未启用）
  };
  var SKILL_PROTOTYPES = {
    SHIELD_ALLY: {
      id: SKILL_IDS.SHIELD_ALLY,
      name: "\u62A4\u76FE\u94FE\u63A5",
      cooldownTicks: 360,
      castTicks: 0,
      targetMode: SkillTargetMode.ALLY,
      // DIST-FIX：协作护盾需靠近队友（140px ≈ 4 tiles），不能隔全图施放。
      range: 140,
      effect: { shieldTicks: 90, shieldReduction: 0.5, rescueBoostTicks: 0, tauntTicks: 0, markTicks: 0, flatDamage: 0 }
    },
    REVIVE_BOOST: {
      id: SKILL_IDS.REVIVE_BOOST,
      name: "\u6025\u6551\u94FE",
      cooldownTicks: 300,
      castTicks: 0,
      targetMode: SkillTargetMode.ALLY,
      // DIST-FIX：急救同样需靠近倒地队友（140px）。
      range: 140,
      effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 45, tauntTicks: 0, markTicks: 0, flatDamage: 0 }
    },
    TAUNT: {
      id: SKILL_IDS.TAUNT,
      name: "\u5632\u8BBD\u6218\u543C",
      cooldownTicks: 420,
      castTicks: 0,
      targetMode: SkillTargetMode.SELF,
      range: 0,
      // SELF 模式无距离限制
      effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 0, tauntTicks: 120, markTicks: 0, flatDamage: 0 }
    },
    MARK: {
      id: SKILL_IDS.MARK,
      name: "\u730E\u624B\u6807\u8BB0",
      cooldownTicks: 420,
      // 14s @30Hz（MARK_CD=14000ms）
      castTicks: 0,
      targetMode: SkillTargetMode.ENEMY,
      // DIST-FIX：远程标记（240px ≈ 7 tiles，游侠射程），略短于 caster 远程 175*1.5。
      range: 240,
      effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 0, tauntTicks: 0, markTicks: 180, flatDamage: 0 }
    },
    BARRAGE: {
      id: SKILL_IDS.BARRAGE,
      name: "\u672F\u6CD5\u5F39\u5E55",
      cooldownTicks: 480,
      // 16s @30Hz（BARRAGE_CD=16000ms）
      castTicks: 0,
      targetMode: SkillTargetMode.ENEMY,
      // DIST-FIX：术士弹幕 240px（远程攻击技）。
      range: 240,
      effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 0, tauntTicks: 0, markTicks: 0, flatDamage: 22 }
    }
  };
  function getSkillPrototype(id) {
    for (const key of Object.keys(SKILL_PROTOTYPES)) {
      if (SKILL_PROTOTYPES[key].id === id) return SKILL_PROTOTYPES[key];
    }
    return null;
  }

  // games/dungeon-online/packages/sim-core/src/rescue.ts
  var RESCUE_RADIUS = 48;
  var RESCUE_TICKS = 90;
  var SOLO_SELF_RESCUE_TICKS = 300;
  var DOWNED_TIMEOUT_TICKS = 600;
  var REVIVAL_HP_RATIO = 0.3;
  var REVIVAL_HP_MIN = 30;
  function withinRescueRadius(self, candidates) {
    const r2 = RESCUE_RADIUS * RESCUE_RADIUS;
    for (const o of candidates) {
      const dx = o.x - self.x;
      const dy = o.y - self.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }
  function revivalHp(maxHp) {
    return Math.max(REVIVAL_HP_MIN, Math.round(maxHp * REVIVAL_HP_RATIO));
  }
  function isOutEligibleTarget(status) {
    return (status & EntityStatus.ALIVE) !== 0 && (status & EntityStatus.DOWNED) === 0 && (status & EntityStatus.OUT) === 0;
  }
  function rescueCandidates(selfId, actors) {
    const out = [];
    for (const o of actors) {
      if (o.id === selfId) continue;
      if (o.kind !== EntityKind.PLAYER) continue;
      if (!isOutEligibleTarget(o.status)) continue;
      if (o.disconnected) continue;
      out.push(o);
    }
    return out;
  }
  function capturePersonalState(seatId, status, hp, downedTicks, rescueTicks) {
    return {
      seatId,
      status,
      hp,
      downedRemainingTicks: Math.max(0, DOWNED_TIMEOUT_TICKS - downedTicks),
      rescueProgressTicks: rescueTicks
    };
  }

  // games/dungeon-online/packages/sim-core/src/rng.ts
  var MASK64 = 0xFFFFFFFFFFFFFFFFn;
  var TWO64 = 1n << 64n;
  function ushr(x, n) {
    const u = x & MASK64;
    const pos = u < 0n ? u + TWO64 : u;
    return pos >> n & MASK64;
  }
  function urotl(x, r) {
    const u = x & MASK64;
    const pos = u < 0n ? u + TWO64 : u;
    return (pos << r | pos >> 64n - r) & MASK64;
  }
  function splitmix64Seed(seed) {
    return BigInt(seed) & MASK64;
  }
  function splitmix64Next(state) {
    const s = state + 0x9e3779b97f4a7c15n & MASK64;
    let z = s;
    z = (z ^ ushr(z, 30n)) * 0xbf58476d1ce4e5b9n & MASK64;
    z = (z ^ ushr(z, 27n)) * 0x94d049bb133111ebn & MASK64;
    z = z ^ ushr(z, 31n);
    return { value: z & MASK64, state: s };
  }
  function xoshiro256Seed(seed) {
    let st = splitmix64Seed(seed);
    const words = [];
    for (let i = 0; i < 4; i++) {
      const r = splitmix64Next(st);
      words.push(r.value);
      st = r.state;
    }
    return { s0: words[0], s1: words[1], s2: words[2], s3: words[3] };
  }
  function xoshiro256Next(st) {
    const { s0, s1, s2, s3 } = st;
    const result = s0 + s3 & MASK64;
    const t = s1 << 17n & MASK64;
    const ns2 = s2 ^ s0;
    const ns3 = s3 ^ s1;
    const ns1 = s1 ^ ns2;
    const ns0 = s0 ^ ns3;
    const s0f = (ns0 ^ t) & MASK64;
    const s3f = urotl(ns3, 45n);
    return {
      value: result & MASK64,
      state: { s0: s0f, s1: ns1 & MASK64, s2: ns2 & MASK64, s3: s3f }
    };
  }
  function hashString64(s) {
    let h = 0xcbf29ce484222325n;
    const PRIME = 0x100000001b3n;
    for (let i = 0; i < s.length; i += 1) {
      h ^= BigInt(s.charCodeAt(i));
      h = h * PRIME & MASK64;
    }
    return h;
  }
  var Rng = class {
    st;
    constructor(seed) {
      this.st = xoshiro256Seed(seed);
    }
    /** 返回 [0, 2^64) 的 uint64。 */
    nextU64() {
      const r = xoshiro256Next(this.st);
      this.st = r.state;
      return r.value;
    }
    /** [0, 1) 浮点（取高 53 位）。 */
    nextFloat() {
      return Number(this.nextU64() >> 11n) / Number(1n << 53n);
    }
    /** [min, max] 整数闭区间（range 较小，安全降为 number）。 */
    nextInt(min, max) {
      if (max < min) [min, max] = [max, min];
      const range = max - min + 1;
      return min + Number(this.nextU64() % BigInt(range));
    }
    /** 以概率 p ∈ [0,1) 命中。 */
    nextBool(p = 0.5) {
      return this.nextFloat() < p;
    }
  };

  // games/dungeon-online/packages/sim-core/src/dungeon-gen.ts
  var GRID_W = 64;
  var GRID_H = 40;
  var TILE_PX = 32;
  var PLAYER_SPAWN_X = 32 * 32;
  var PLAYER_SPAWN_Y = 20 * 32;
  var FLOOR_VARIANT_MAX_BONUS = 2;
  var FLOOR_COUNT_MIN = 3;
  var FLOOR_COUNT_MAX = 5;
  var WAVES_PER_FLOOR_MIN = 2;
  var WAVES_PER_FLOOR_MAX = 4;
  var SPAWN_COUNT_MIN = 6;
  var SPAWN_COUNT_MAX = 10;
  var RESOURCE_NODE_MIN = 4;
  var RESOURCE_NODE_MAX = 8;
  var INJECTED_ENEMY_MIN_WAVE = 2;
  var CASTER_INJECTION_CHANCE = 0.2;
  var BRUTE_INJECTION_CHANCE = 0.2;
  var BOMBER_INJECTION_CHANCE = 0.15;
  var GUNNER_INJECTION_CHANCE = 0.12;
  var BRUTE_CUM = BRUTE_INJECTION_CHANCE;
  var BOMBER_CUM = BRUTE_INJECTION_CHANCE + BOMBER_INJECTION_CHANCE;
  var GUNNER_CUM = BOMBER_CUM + GUNNER_INJECTION_CHANCE;
  var INJECTED_ENEMY_IDS = [
    "caster_ember",
    "brute_charger",
    "bomber_imp",
    "gunner_imp"
  ];
  function generateLayout(seed, biomeId) {
    const rng = new Rng(hashString64(`${seed}:${biomeId}`));
    const floorCount = rng.nextInt(FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
    const floorSequence = [];
    for (let f = 0; f < floorCount; f += 1) {
      floorSequence.push(rng.nextInt(0, biomeId + FLOOR_VARIANT_MAX_BONUS));
    }
    const floorOfWave = [];
    const enemyTypeIds = Object.keys(ENEMY_PROTOTYPES).filter(
      (id) => !INJECTED_ENEMY_IDS.includes(id)
    );
    const spawnPoints = [];
    let wave = 0;
    for (let f = 0; f < floorCount; f += 1) {
      const wavesThisFloor = rng.nextInt(WAVES_PER_FLOOR_MIN, WAVES_PER_FLOOR_MAX);
      for (let w = 0; w < wavesThisFloor; w += 1) {
        wave += 1;
        floorOfWave[wave] = f + 1;
        const rolled = enemyTypeIds[rng.nextInt(0, enemyTypeIds.length - 1)];
        let enemyTypeId;
        if (rolled === "elite_warden") {
          enemyTypeId = rng.nextBool(CASTER_INJECTION_CHANCE) ? "caster_ember" : rolled;
        } else if (rolled === "grunt_swarm") {
          const r = rng.nextFloat();
          if (r < BRUTE_CUM) {
            enemyTypeId = "brute_charger";
          } else if (wave >= INJECTED_ENEMY_MIN_WAVE && r < BOMBER_CUM) {
            enemyTypeId = "bomber_imp";
          } else if (wave >= INJECTED_ENEMY_MIN_WAVE && r < GUNNER_CUM) {
            enemyTypeId = "gunner_imp";
          } else {
            enemyTypeId = "grunt_swarm";
          }
        } else {
          enemyTypeId = rolled;
        }
        const count = rng.nextInt(SPAWN_COUNT_MIN, SPAWN_COUNT_MAX);
        let pos;
        if (wave === 1) {
          const anchorRng = new Rng(hashString64(`${seed}:${biomeId}:w1-anchor`));
          const ang = anchorRng.nextFloat() * Math.PI * 2;
          const dist = anchorRng.nextInt(150, 300);
          pos = {
            x: Math.round(PLAYER_SPAWN_X + Math.cos(ang) * dist),
            y: Math.round(PLAYER_SPAWN_Y + Math.sin(ang) * dist)
          };
        } else {
          pos = {
            x: rng.nextInt(0, GRID_W - 1) * TILE_PX,
            y: rng.nextInt(0, GRID_H - 1) * TILE_PX
          };
        }
        spawnPoints.push({ pos, enemyTypeId, wave, count });
      }
    }
    const firstWave1 = spawnPoints.find((sp) => sp.wave === 1);
    if (firstWave1 && !spawnPoints.some((sp) => sp.wave === 1 && sp.enemyTypeId === "grunt_swarm")) {
      spawnPoints[spawnPoints.indexOf(firstWave1)] = {
        ...firstWave1,
        enemyTypeId: "grunt_swarm"
      };
    }
    const resourceIds = Object.keys(RESOURCE_PROTOTYPES);
    const resourceNodes = [];
    const resCount = rng.nextInt(RESOURCE_NODE_MIN, RESOURCE_NODE_MAX);
    for (let i = 0; i < resCount; i += 1) {
      resourceNodes.push({
        pos: {
          x: rng.nextInt(0, GRID_W - 1) * TILE_PX,
          y: rng.nextInt(0, GRID_H - 1) * TILE_PX
        },
        resourceId: resourceIds[rng.nextInt(0, resourceIds.length - 1)]
      });
    }
    return { seed, biomeId, spawnPoints, resourceNodes, floorSequence, floorOfWave };
  }

  // games/dungeon-online/packages/sim-core/src/input.ts
  var PerPlayerInputQueue = class {
    players = /* @__PURE__ */ new Map();
    /** 注册一个玩家（world 创建时按座位调用），初始化 lastSeq=0、pending=null。 */
    register(playerId) {
      if (!this.players.has(playerId)) {
        this.players.set(playerId, { lastSeq: 0, pending: null });
      }
    }
    /**
     * 入队一条输入（C11 反作弊：拒绝 seq 非严格递增的包）。
     * - cmd.seq <= lastSeq → 视为重复 / 回放 / 倒序，丢弃并返回 false。
     * - 否则记录 pending（覆盖同 tick 内的更早有效包），更新 lastSeq，返回 true。
     * @returns 是否被接受（false = 被 C11 规则丢弃）。
     */
    enqueue(playerId, cmd) {
      const st = this.players.get(playerId);
      if (!st) return false;
      if (cmd.seq <= st.lastSeq) return false;
      st.pending = cmd;
      st.lastSeq = cmd.seq;
      return true;
    }
    /**
     * 取本 tick 应生效的最新有效输入（不清 lastSeq，仅清 pending）。
     * 返回 playerId → 最新 InputCmd 的映射，供 world.step 应用。
     */
    drain() {
      const out = /* @__PURE__ */ new Map();
      for (const [pid, st] of this.players) {
        if (st.pending) {
          out.set(pid, st.pending);
          st.pending = null;
        }
      }
      return out;
    }
    /** 各玩家已消费的最大 seq（对账/插值用；key=playerId）。 */
    lastProcessedSeq() {
      const out = {};
      for (const [pid, st] of this.players) out[pid] = st.lastSeq;
      return out;
    }
    /** 是否存在某玩家（world 清理/校验用）。 */
    has(playerId) {
      return this.players.has(playerId);
    }
  };
  function drainForTick(queue) {
    return queue.drain();
  }

  // games/dungeon-online/packages/sim-core/src/combat.ts
  var MIN_TELEGRAPH_TICKS = 18;
  var PLAYER_ATTACK_DAMAGE = 38;
  var PLAYER_ATTACK_RANGE = 130;
  var KNOCKBACK_TICKS = 4;
  var BOSS_NOVA_INTERVAL = 50;
  var BOSS_NOVA_RADIUS = 130;
  var BOSS_NOVA_TELEGRAPH = 25;
  var PLAYER_ATTACK_CONE_RAD = Math.PI / 3;
  var DODGE_IFRAME_TICKS = 12;
  var CombatKind = {
    ATTACK: 1,
    DODGE: 2,
    SKILL: 3,
    PROJECTILE: 4
  };
  function resolveDamage(state, req) {
    const target = state.entities.get(req.targetId);
    const source = state.entities.get(req.sourceId);
    if (!target) {
      return { targetId: req.targetId, deltaHp: 0, statusChange: 0, tick: state.tick };
    }
    if (req.kind === CombatKind.DODGE) {
      const ent = source ?? target;
      ent.iframeUntilTick = state.tick + DODGE_IFRAME_TICKS;
      ent.status |= EntityStatus.IFRAME;
      return {
        targetId: ent.id,
        deltaHp: 0,
        statusChange: ent.status,
        tick: state.tick
      };
    }
    if (req.kind !== CombatKind.PROJECTILE && source?.telegraph && source.telegraph.applyTick > state.tick) {
      return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
    }
    if (target.iframeUntilTick != null && state.tick <= target.iframeUntilTick) {
      return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
    }
    if ((target.status & (EntityStatus.DOWNED | EntityStatus.OUT)) !== 0) {
      return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
    }
    let dmgBase = req.enemyDamage != null ? req.enemyDamage : PLAYER_ATTACK_DAMAGE;
    if (source?.level != null && source.level > 1 && req.enemyDamage == null) {
      dmgBase += (source.level - 1) * 3;
    }
    let dmg = dmgBase;
    if (source?.buffUntilTick != null && source.buffUntilTick > 0 && state.tick <= source.buffUntilTick && source.buffMult != null && source.buffMult > 0) {
      dmg = Math.round(dmg * source.buffMult);
    }
    if (source?.perkDamageMult != null && source.perkDamageMult > 0) {
      dmg = Math.round(dmg * source.perkDamageMult);
    }
    if (target.shieldUntilTick != null && target.shieldUntilTick > 0 && state.tick <= target.shieldUntilTick && target.shieldReduction != null && target.shieldReduction > 0) {
      dmg = Math.max(0, Math.round(dmgBase * (1 - target.shieldReduction)));
    }
    if (target.markedUntilTick != null && target.markedUntilTick > state.tick) {
      dmg = Math.round(dmg * 1.25);
    }
    const isCrit = req.critMult != null && req.critMult > 1;
    if (isCrit) {
      dmg = Math.round(dmg * req.critMult);
    }
    const before = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    const deltaHp = target.hp - before;
    if (target.hp <= 0) {
      target.status |= EntityStatus.DOWNED;
    }
    return {
      targetId: req.targetId,
      deltaHp,
      statusChange: target.status,
      tick: state.tick,
      crit: isCrit || void 0
    };
  }

  // games/dungeon-online/packages/sim-core/src/enemy-ai.ts
  function stepEnemyAi(self, ctx) {
    const proto = ENEMY_PROTOTYPES[self.enemyTypeId];
    const taunters = ctx.players.filter((p) => p.taunt === true);
    const pool = taunters.length > 0 ? taunters : ctx.players;
    let nearest = null;
    let bestSq = Infinity;
    for (const p of pool) {
      if (!p.alive) continue;
      const dx2 = p.x - self.x;
      const dy2 = p.y - self.y;
      const dSq = dx2 * dx2 + dy2 * dy2;
      if (dSq < bestSq) {
        bestSq = dSq;
        nearest = p;
      }
    }
    if (!nearest) {
      return { type: "MOVE", dir: { x: 0, y: 0 } };
    }
    const dist = Math.sqrt(bestSq);
    if (self.enemyTypeId === "bomber_imp") {
      if (dist <= proto.attackRange) {
        return { type: "ATTACK", targetId: nearest.id, damage: proto.attackDamage };
      }
      const dx2 = nearest.x - self.x;
      const dy2 = nearest.y - self.y;
      const len2 = Math.hypot(dx2, dy2) || 1;
      return { type: "MOVE", dir: { x: dx2 / len2, y: dy2 / len2 } };
    }
    if (self.enemyTypeId === "gunner_imp") {
      const retreatThreshold = proto.attackRange * 0.55;
      if (dist < retreatThreshold) {
        const dx3 = self.x - nearest.x;
        const dy3 = self.y - nearest.y;
        const len3 = Math.hypot(dx3, dy3) || 1;
        return { type: "MOVE", dir: { x: dx3 / len3, y: dy3 / len3 } };
      }
      if (dist <= proto.attackRange) {
        return { type: "ATTACK", targetId: nearest.id, damage: proto.attackDamage };
      }
      const dx2 = nearest.x - self.x;
      const dy2 = nearest.y - self.y;
      const len2 = Math.hypot(dx2, dy2) || 1;
      return { type: "MOVE", dir: { x: dx2 / len2, y: dy2 / len2 } };
    }
    if (dist <= proto.attackRange) {
      return { type: "ATTACK", targetId: nearest.id, damage: proto.attackDamage };
    }
    if (self.enemyTypeId === "caster_ember") {
      const retreatThreshold = proto.attackRange * 0.55;
      if (dist < retreatThreshold) {
        const dx2 = self.x - nearest.x;
        const dy2 = self.y - nearest.y;
        const len2 = Math.hypot(dx2, dy2) || 1;
        return { type: "MOVE", dir: { x: dx2 / len2, y: dy2 / len2 } };
      }
    }
    const dx = nearest.x - self.x;
    const dy = nearest.y - self.y;
    const len = Math.hypot(dx, dy) || 1;
    return { type: "MOVE", dir: { x: dx / len, y: dy / len } };
  }

  // games/dungeon-online/packages/sim-core/src/skills.ts
  function toApplication(proto, casterId, targetId) {
    return {
      skillId: proto.id,
      casterId,
      targetId,
      cooldownTicks: proto.cooldownTicks,
      shieldTicks: proto.effect.shieldTicks,
      shieldReduction: proto.effect.shieldReduction,
      rescueBoostTicks: proto.effect.rescueBoostTicks,
      tauntTicks: proto.effect.tauntTicks,
      markTicks: proto.effect.markTicks,
      flatDamage: proto.effect.flatDamage
    };
  }
  function resolveSkillApplication(caster, target, skillId, tick, allowSelfCast = false) {
    const proto = getSkillPrototype(skillId);
    if (!proto) return null;
    if (caster.classId != null) {
      const allowed = CLASS_SKILLS[caster.classId];
      if (!allowed || !allowed.includes(skillId)) return null;
    }
    void tick;
    if (caster.disconnected) return null;
    if (proto.targetMode === SkillTargetMode.SELF) {
      return toApplication(proto, caster.id, caster.id);
    }
    if (proto.range > 0 && caster.x != null && caster.y != null && target && target.x != null && target.y != null) {
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      if (dx * dx + dy * dy > proto.range * proto.range) return null;
    }
    if (proto.targetMode === SkillTargetMode.ENEMY) {
      if (!target) return null;
      if (target.kind !== EntityKind.ENEMY && target.kind !== EntityKind.BOSS) return null;
      return toApplication(proto, caster.id, target.id);
    }
    if (!target) return null;
    if (target.kind !== EntityKind.PLAYER) return null;
    if (target.id === caster.id) {
      if (!allowSelfCast) return null;
      if (skillId !== SKILL_IDS.SHIELD_ALLY) return null;
    }
    if (target.disconnected) return null;
    if (skillId === SKILL_IDS.REVIVE_BOOST) {
      if ((target.status & EntityStatus.DOWNED) === 0) return null;
    }
    return toApplication(proto, caster.id, target.id);
  }

  // games/dungeon-online/packages/sim-core/src/world.ts
  var PERK_CATALOG = {
    dmg_up: { name: "\u4F24\u5BB3\u5F3A\u5316", desc: "\u6240\u6709\u653B\u51FB\u4F24\u5BB3 +15%", icon: "\u2694" },
    hp_up: { name: "\u751F\u547D\u5F3A\u5316", desc: "\u751F\u547D\u4E0A\u9650 +20", icon: "\u2764" },
    spd_up: { name: "\u8EAB\u6CD5\u5F3A\u5316", desc: "\u79FB\u52A8\u901F\u5EA6 +12%", icon: "\u{1F4A8}" },
    cdr_up: { name: "\u51B7\u5374\u52A0\u901F", desc: "\u6280\u80FD\u51B7\u5374\u65F6\u95F4 -15%", icon: "\u23F1" },
    atkspd_up: { name: "\u653B\u901F\u5F3A\u5316", desc: "\u666E\u653B\u524D\u6447 -25%\uFF08\u6325\u780D\u66F4\u5FEB\uFF09", icon: "\u{1F5E1}" },
    range_up: { name: "\u8303\u56F4\u5F3A\u5316", desc: "\u653B\u51FB\u8303\u56F4 +25%\uFF08\u780D\u5F97\u66F4\u8FDC\uFF09", icon: "\u{1F6E1}" },
    lifesteal_up: { name: "\u6C72\u53D6", desc: "\u51FB\u6740\u654C\u4EBA\u56DE\u590D 3 \u751F\u547D", icon: "\u{1FA78}" }
  };
  var PERK_CHOICES_PER_FLOOR = 3;
  var PERK_POOL = Object.keys(PERK_CATALOG);
  function moveSpeedPerTick(classId) {
    return CLASS_BASE[classId].moveSpeed / 30;
  }
  var DIR_UNIT_VECTORS = [
    { x: 1, y: 0 },
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: 0, y: 1 },
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: -1, y: 0 },
    { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: 0, y: -1 },
    { x: Math.SQRT1_2, y: -Math.SQRT1_2 }
  ];
  function dirToVector(dir) {
    const k = (Math.trunc(dir) % 8 + 8) % 8;
    return DIR_UNIT_VECTORS[k];
  }
  function vecToDir8(v) {
    const len = Math.hypot(v.x, v.y);
    if (len < 1e-6) return 0;
    const k = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) & 7;
    return k;
  }
  function createWorld(opts) {
    const layout = generateLayout(opts.seed, opts.biomeId);
    const actors = [];
    let nextId = 0;
    let projectiles = [];
    let projSeq = 1;
    const spawnEnemiesEnabled = opts.spawnEnemies !== false;
    let currentWave = 1;
    let maxWave = Math.max(1, ...layout.spawnPoints.map((s) => s.wave));
    let intermissionUntilTick = 0;
    let currentRoomPhase = RoomPhase.ACTIVE;
    let currentFloor = layout.floorOfWave[1] ?? 1;
    let perkChoicesState = [];
    let lastPerkFloor = 0;
    let pendingFloorRoute = null;
    let activeFloorRoute = null;
    let lastRouteFloor = 0;
    function openFloorRoute(nextFloor) {
      if (nextFloor <= 1 || lastRouteFloor === nextFloor) return;
      lastRouteFloor = nextFloor;
      const rr = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:route:${nextFloor}`));
      const options = [
        { id: "deep", name: "\u6DF1\u6E0A", desc: "\u654C\u4EBA\u66F4\u8089(+20% HP) \u4F46\u7ECF\u9A8C +50%", icon: "\u{1F30B}" },
        { id: "vault", name: "\u5B9D\u5E93", desc: "\u654C\u4EBA\u66F4\u5C11(-25%) \u4F46\u6389\u843D\u7387 \xD72", icon: "\u{1F48E}" }
      ];
      pendingFloorRoute = { options };
    }
    const pickedPerkThisOffer = /* @__PURE__ */ new Set();
    const waveHasBoss = [];
    for (let n = 1; n <= maxWave; n += 1) {
      waveHasBoss[n] = layout.spawnPoints.some(
        (sp) => sp.wave === n && ENEMY_PROTOTYPES[sp.enemyTypeId].tier === "boss"
      );
    }
    function trySpawnLoot(dead, tick) {
      const lootCount = () => actors.reduce((n, a) => n + (a.kind === EntityKind.LOOT ? 1 : 0), 0);
      if (lootCount() >= MAX_LOOT_ENTITIES) return;
      let drops = [];
      if (dead.enemyTypeId === "boss_emberlord") {
        drops.push({ lootType: 0, value: LOOT_MEDKIT_HEAL });
        drops.push({ lootType: 2, value: LOOT_BUFF_PERCENT });
      } else {
        const rng = new Rng(hashString64(`${dead.id}:${tick}:loot`));
        if (!rng.nextBool(LOOT_DROP_CHANCE)) return;
        const r = rng.nextFloat();
        if (r < 0.5) drops.push({ lootType: 0, value: LOOT_MEDKIT_HEAL });
        else if (r < 0.8) drops.push({ lootType: 1, value: 0 });
        else drops.push({ lootType: 2, value: LOOT_BUFF_PERCENT });
      }
      for (const d of drops) {
        if (lootCount() >= MAX_LOOT_ENTITIES) break;
        const rng = new Rng(hashString64(`${dead.id}:${tick}:loot:${d.lootType}`));
        actors.push({
          id: nextId++,
          kind: EntityKind.LOOT,
          x: dead.x + rng.nextInt(-8, 8),
          y: dead.y + rng.nextInt(-8, 8),
          dir: 0,
          hp: 0,
          maxHp: 0,
          status: 0,
          lootType: d.lootType,
          value: d.value,
          rescueTicks: 0,
          downedTicks: 0,
          disconnected: false,
          personalState: null
        });
      }
    }
    function spawnBossAdds(boss, tick) {
      const proto = ENEMY_PROTOTYPES.grunt_swarm;
      const rng = new Rng(hashString64(`${boss.id}:${tick}:adds`));
      for (let i = 0; i < 2; i++) {
        const ox = rng.nextInt(-48, 48);
        const oy = rng.nextInt(-48, 48);
        const hp = rng.nextInt(proto.hpMin, proto.hpMax);
        actors.push({
          id: nextId++,
          kind: EntityKind.ENEMY,
          x: boss.x + ox,
          y: boss.y + oy,
          dir: rng.nextInt(0, 7),
          hp,
          maxHp: hp,
          status: EntityStatus.ALIVE,
          enemyTypeId: "grunt_swarm",
          enraged: void 0,
          rescueTicks: 0,
          downedTicks: 0,
          disconnected: false,
          personalState: null
        });
      }
    }
    function grantXp(pl, amount) {
      if (pl.kind !== EntityKind.PLAYER) return;
      pl.xp = (pl.xp ?? 0) + amount;
      let lv = pl.level ?? 1;
      let leveled = false;
      while ((pl.xp ?? 0) >= 30 + (lv - 1) * 25) {
        pl.xp = (pl.xp ?? 0) - (30 + (lv - 1) * 25);
        lv += 1;
        pl.level = lv;
        pl.maxHp += 10;
        pl.hp = Math.min(pl.maxHp, pl.hp + Math.ceil(pl.maxHp * 0.2));
        pl.levelUpCount = (pl.levelUpCount ?? 0) + 1;
        leveled = true;
      }
      if (leveled && perkChoicesState.length === 0) {
        const upRng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:lvlup:${pl.id}:${lv}`));
        const pool = [...PERK_POOL];
        perkChoicesState = [];
        for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
          const idx = upRng.nextInt(0, pool.length - 1);
          perkChoicesState.push(pool[idx]);
          pool.splice(idx, 1);
        }
        pickedPerkThisOffer.clear();
      }
    }
    function spawnChargerAdd(charger, tick) {
      const proto = ENEMY_PROTOTYPES.grunt_swarm;
      const rng = new Rng(hashString64(`${charger.id}:${tick}:chargerAdd`));
      const ox = rng.nextInt(-40, 40);
      const oy = rng.nextInt(-40, 40);
      const hp = rng.nextInt(proto.hpMin, proto.hpMax);
      actors.push({
        id: nextId++,
        kind: EntityKind.ENEMY,
        x: charger.x + ox,
        y: charger.y + oy,
        dir: rng.nextInt(0, 7),
        hp,
        maxHp: hp,
        status: EntityStatus.ALIVE,
        enemyTypeId: "grunt_swarm",
        enraged: void 0,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null
      });
    }
    function spawnWave(n) {
      const wrng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:wave:${n}:enemies`));
      const waveFloor = layout.floorOfWave[n] ?? 1;
      let floorScale = 1 + 0.15 * (waveFloor - 1);
      let routeCountScale = 1;
      if (activeFloorRoute === "deep") floorScale *= 1.2;
      else if (activeFloorRoute === "vault") routeCountScale = 0.75;
      for (const sp of layout.spawnPoints) {
        if (sp.wave !== n) continue;
        const proto = ENEMY_PROTOTYPES[sp.enemyTypeId];
        const spCount = Math.max(1, Math.round(sp.count * routeCountScale));
        for (let i = 0; i < spCount; i += 1) {
          const hp = Math.max(1, Math.round(wrng.nextInt(proto.hpMin, proto.hpMax) * floorScale));
          const kind = proto.tier === "boss" ? EntityKind.BOSS : EntityKind.ENEMY;
          let affix;
          if (proto.tier === "elite") {
            affix = wrng.nextInt(0, 1) === 0 ? "hasted" : "lifesteal";
          }
          actors.push({
            id: nextId++,
            kind,
            x: sp.pos.x + wrng.nextInt(-32, 32),
            y: sp.pos.y + wrng.nextInt(-32, 32),
            dir: wrng.nextInt(0, 7),
            hp,
            maxHp: hp,
            status: EntityStatus.ALIVE,
            enemyTypeId: sp.enemyTypeId,
            affix,
            enraged: void 0,
            rescueTicks: 0,
            downedTicks: 0,
            disconnected: false,
            personalState: null,
            // BOSS-MULTI-SKILL（P2）：boss 首颗新星由 wave seed 确定性派生（错峰 1.5-3s），
            //   之后每 +BOSS_NOVA_INTERVAL tick 一次（phase 段纯算术推进，无随机源）。
            bossNovaAtTick: kind === EntityKind.BOSS ? wrng.nextInt(45, 90) : void 0
          });
        }
      }
      currentWave = n;
      currentRoomPhase = waveHasBoss[n] ? RoomPhase.BOSS : RoomPhase.ACTIVE;
    }
    function stepProjectiles(state) {
      for (const p of projectiles) {
        p.x += p.vx;
        p.y += p.vy;
      }
      const pr = 14;
      for (const p of projectiles) {
        if (p.expireTick === -1) continue;
        for (const pl of actors) {
          if (pl.kind !== EntityKind.PLAYER) continue;
          if (!isOutEligibleTarget(pl.status)) continue;
          if (Math.hypot(p.x - pl.x, p.y - pl.y) <= p.radius + pr) {
            resolveDamage(state, {
              sourceId: p.ownerId,
              targetId: pl.id,
              amount: 0,
              tick: world.tick,
              kind: CombatKind.PROJECTILE,
              enemyDamage: p.damage
            });
            p.expireTick = -1;
            break;
          }
        }
      }
      projectiles = projectiles.filter(
        (p) => p.expireTick > world.tick && p.expireTick !== -1 && p.x > -256 && p.x < 2304 && p.y > -256 && p.y < 1536
      );
    }
    const centerX = 32 * 32;
    const centerY = 20 * 32;
    for (const p of opts.players) {
      const base = CLASS_BASE[p.classId];
      const angle = p.seatId / Math.max(1, opts.players.length) * Math.PI * 2;
      actors.push({
        id: nextId++,
        kind: EntityKind.PLAYER,
        x: centerX + Math.round(Math.cos(angle) * 64),
        y: centerY + Math.round(Math.sin(angle) * 64),
        dir: 0,
        hp: base.hp,
        maxHp: base.hp,
        status: EntityStatus.ALIVE,
        ownerId: p.seatId,
        classId: p.classId,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null,
        // ── G1 升级初始状态（击杀得经验 → 升级提升属性）──
        level: 1,
        xp: 0,
        // ── E8 协作技初始状态（仅玩家持有；敌人不施技，字段保持 undefined）──
        cooldownUntilTick: 0,
        activeSkill: null,
        shieldUntilTick: 0,
        shieldReduction: 0,
        tauntUntilTick: 0
      });
      if (opts.startingPerks && opts.startingPerks.length > 0) {
        const pl = actors[actors.length - 1];
        const plBase = CLASS_BASE[p.classId];
        for (const pid of opts.startingPerks) {
          if (pid === "dmg_up") pl.perkDamageMult = (pl.perkDamageMult ?? 1) * 1.15;
          else if (pid === "spd_up") pl.perkSpeedMult = (pl.perkSpeedMult ?? 1) * 1.12;
          else if (pid === "cdr_up") pl.perkCdr = (pl.perkCdr ?? 0) + 0.15;
          else if (pid === "atkspd_up") pl.perkAtkspd = (pl.perkAtkspd ?? 1) * 0.75;
          else if (pid === "range_up") pl.perkRangeMult = (pl.perkRangeMult ?? 1) * 1.25;
          else if (pid === "hp_up") {
            const bonus = (pl.perkMaxHpBonus ?? 0) + 20;
            pl.perkMaxHpBonus = bonus;
            pl.maxHp = plBase.hp + bonus;
            pl.hp = pl.maxHp;
          } else if (pid === "lifesteal_up") {
          }
          pl.perks = pl.perks ? [...pl.perks, pid] : [pid];
        }
      }
    }
    if (spawnEnemiesEnabled) {
      spawnWave(1);
    }
    const inputs = new PerPlayerInputQueue();
    for (const p of opts.players) inputs.register(p.seatId);
    const world = {
      runId: opts.runId,
      seed: opts.seed,
      biomeId: opts.biomeId,
      tick: 0,
      get roomPhase() {
        return currentRoomPhase;
      },
      actors: () => actors.slice(),
      projectiles: () => projectiles.slice(),
      enqueueInput(playerId, cmd) {
        return inputs.enqueue(playerId, cmd);
      },
      step() {
        const perPlayer = drainForTick(inputs);
        const entityMap = /* @__PURE__ */ new Map();
        for (const a of actors) entityMap.set(a.id, a);
        const combatState = { tick: world.tick, entities: entityMap };
        for (const a of actors) {
          if (a.iframeUntilTick != null && a.iframeUntilTick <= world.tick) {
            a.status &= ~EntityStatus.IFRAME;
            a.iframeUntilTick = void 0;
          }
          if (a.shieldUntilTick != null && a.shieldUntilTick > 0 && a.shieldUntilTick <= world.tick) {
            a.shieldUntilTick = 0;
            a.shieldReduction = 0;
          }
          if (a.tauntUntilTick != null && a.tauntUntilTick > 0 && a.tauntUntilTick <= world.tick) {
            a.tauntUntilTick = 0;
          }
          if (a.cooldownUntilTick != null && a.cooldownUntilTick > 0 && a.cooldownUntilTick <= world.tick) {
            a.cooldownUntilTick = 0;
          }
          if ((a.status & EntityStatus.ALIVE) !== 0 && !(a.status & EntityStatus.DOWNED) && !(a.status & EntityStatus.OUT) && !a.disconnected && a.kind === EntityKind.PLAYER) {
            const cmd = perPlayer.get(a.ownerId);
            if (!cmd) continue;
            if (cmd.action === InputAction.MOVE) {
              const ms = moveSpeedPerTick(a.classId) * (a.perkSpeedMult ?? 1);
              a.x += cmd.dir.x * ms;
              a.y += cmd.dir.y * ms;
              if (cmd.dir.x !== 0 || cmd.dir.y !== 0) a.dir = vecToDir8(cmd.dir);
            } else if (cmd.action === InputAction.ATTACK) {
              if (!a.telegraph) {
                let targetOk = false;
                if (cmd.target != null) {
                  const tgt = actors.find((t) => t.id === cmd.target);
                  if (tgt && (tgt.status & EntityStatus.ALIVE) !== 0) {
                    const dx = tgt.x - a.x;
                    const dy = tgt.y - a.y;
                    const rangePx = PLAYER_ATTACK_RANGE * (a.perkRangeMult ?? 1);
                    targetOk = dx * dx + dy * dy <= rangePx * rangePx;
                  }
                }
                if (!targetOk) {
                  a.telegraph = null;
                } else {
                  const d = cmd.dir && (cmd.dir.x !== 0 || cmd.dir.y !== 0) ? cmd.dir : { x: 1, y: 0 };
                  const dl = Math.hypot(d.x, d.y) || 1;
                  const windupTicks = Math.max(
                    1,
                    Math.round(MIN_TELEGRAPH_TICKS * (a.perkAtkspd ?? 1))
                  );
                  a.telegraph = {
                    startTick: world.tick,
                    applyTick: world.tick + windupTicks,
                    targetId: cmd.target,
                    kind: CombatKind.ATTACK,
                    dir: { x: d.x / dl, y: d.y / dl }
                  };
                }
              }
            } else if (cmd.action === InputAction.SKILL) {
              if ((a.cooldownUntilTick ?? 0) <= world.tick) {
                let target = cmd.target != null ? actors.find((t) => t.id === cmd.target) ?? null : null;
                const skillId = cmd.param ?? SKILL_IDS.SHIELD_ALLY;
                const hasOtherPlayer = actors.some(
                  (t) => t.kind === EntityKind.PLAYER && t.id !== a.id && !(t.status & EntityStatus.OUT)
                );
                const allowSelfCast = !hasOtherPlayer && skillId === SKILL_IDS.SHIELD_ALLY;
                if (allowSelfCast) target = a;
                const app = resolveSkillApplication(
                  { id: a.id, kind: a.kind, status: a.status, disconnected: a.disconnected, classId: a.classId, x: a.x, y: a.y },
                  target ? { id: target.id, kind: target.kind, status: target.status, disconnected: target.disconnected, classId: target.classId, x: target.x, y: target.y } : null,
                  skillId,
                  world.tick,
                  allowSelfCast
                );
                if (app) {
                  if (app.shieldTicks > 0) {
                    const tgt = actors.find((t) => t.id === app.targetId);
                    if (tgt) {
                      tgt.shieldUntilTick = world.tick + app.shieldTicks;
                      tgt.shieldReduction = app.shieldReduction;
                    }
                  }
                  if (app.rescueBoostTicks > 0) {
                    const tgt = actors.find((t) => t.id === app.targetId);
                    if (tgt) tgt.rescueTicks += app.rescueBoostTicks;
                  }
                  if (app.tauntTicks > 0) {
                    a.tauntUntilTick = world.tick + app.tauntTicks;
                  }
                  if (app.markTicks > 0) {
                    const tgt = actors.find((t) => t.id === app.targetId);
                    if (tgt) tgt.markedUntilTick = world.tick + app.markTicks;
                  }
                  if (app.flatDamage > 0) {
                    resolveDamage(combatState, {
                      sourceId: app.casterId,
                      targetId: app.targetId,
                      amount: 0,
                      tick: world.tick,
                      kind: CombatKind.SKILL,
                      enemyDamage: app.flatDamage
                    });
                  }
                  const cdr = a.perkCdr ?? 0;
                  a.cooldownUntilTick = world.tick + Math.round(app.cooldownTicks * (1 - cdr));
                  a.activeSkill = app.skillId;
                }
              }
            } else if (cmd.action === InputAction.DODGE) {
              resolveDamage(combatState, {
                sourceId: a.id,
                targetId: a.id,
                amount: 0,
                tick: world.tick,
                kind: CombatKind.DODGE
              });
            } else if (cmd.action === InputAction.CHOOSE_FLOOR) {
              if (pendingFloorRoute && cmd.param != null && cmd.param >= 0 && cmd.param < pendingFloorRoute.options.length) {
                const opt = pendingFloorRoute.options[cmd.param];
                activeFloorRoute = opt.id;
                pendingFloorRoute = null;
                spawnWave(currentWave + 1);
              }
            }
          } else if (a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) {
            const self = {
              id: a.id,
              x: a.x,
              y: a.y,
              enemyTypeId: a.enemyTypeId
            };
            const players = actors.filter((t) => t.kind === EntityKind.PLAYER && isOutEligibleTarget(t.status)).map((t) => ({
              id: t.id,
              x: t.x,
              y: t.y,
              alive: true,
              // ⑨ E8 TAUNT：施法者处于嘲讽窗口 → 敌人 AI 优先锁定（吸引敌火）。
              taunt: t.tauntUntilTick != null && t.tauntUntilTick > 0 && t.tauntUntilTick > world.tick
            }));
            const intent = stepEnemyAi(self, { tick: world.tick, players });
            let speedMult = 1;
            let telMult = 1;
            if (a.kind === EntityKind.BOSS) {
              const ratio = a.maxHp > 0 ? a.hp / a.maxHp : 0;
              const phase = ratio < 0.25 ? 3 : ratio < 0.5 ? 2 : 1;
              if (phase > (a.phase ?? 1)) {
                a.phase = phase;
                if (phase === 3) spawnBossAdds(a, world.tick);
              }
              speedMult = phase >= 3 ? 1.6 : phase >= 2 ? 1.4 : 1;
              telMult = phase >= 2 ? 0.8 : 1;
              if (a.bossNovaAtTick != null && world.tick >= a.bossNovaAtTick && a.novaFiredTick !== world.tick) {
                a.novaFiredTick = world.tick;
                a.bossNovaAtTick = world.tick + BOSS_NOVA_INTERVAL;
                a.telegraph = {
                  startTick: world.tick,
                  applyTick: world.tick + Math.max(1, Math.round(BOSS_NOVA_TELEGRAPH * telMult)),
                  targetId: a.id,
                  // 新星无特定目标（AOE），targetId 仅占位
                  kind: CombatKind.ATTACK,
                  novaRadius: BOSS_NOVA_RADIUS
                };
              }
            }
            if (a.kbUntilTick != null && a.kbUntilTick > world.tick) {
              const kbSpeed = 130;
              const kbStep = kbSpeed / 30;
              a.x += (a.kbDirX ?? 0) * kbStep;
              a.y += (a.kbDirY ?? 0) * kbStep;
            } else if (intent.type === "MOVE") {
              const proto = ENEMY_PROTOTYPES[a.enemyTypeId];
              const affixMult = a.affix === "hasted" ? 1.4 : 1;
              const ms = proto.speed / 30 * speedMult * affixMult;
              a.x += intent.dir.x * ms;
              a.y += intent.dir.y * ms;
              if (intent.dir.x !== 0 || intent.dir.y !== 0) a.dir = vecToDir8(intent.dir);
            } else if (intent.type === "ATTACK") {
              if (!a.telegraph) {
                const proto = ENEMY_PROTOTYPES[a.enemyTypeId];
                a.telegraph = {
                  startTick: world.tick,
                  applyTick: world.tick + Math.round(proto.telegraphTicks * telMult),
                  targetId: intent.targetId,
                  kind: CombatKind.ATTACK
                };
              }
            }
          }
        }
        for (const a of actors) {
          if (a.telegraph && a.telegraph.applyTick <= world.tick) {
            const proto = a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId] : null;
            if (a.kind === EntityKind.BOSS && a.telegraph.novaRadius != null) {
              const r2 = a.telegraph.novaRadius * a.telegraph.novaRadius;
              for (const t of actors) {
                if (t.kind !== EntityKind.PLAYER) continue;
                if ((t.status & EntityStatus.ALIVE) === 0) continue;
                const dx = t.x - a.x;
                const dy = t.y - a.y;
                if (dx * dx + dy * dy <= r2) {
                  resolveDamage(combatState, {
                    sourceId: a.id,
                    targetId: t.id,
                    amount: 0,
                    tick: world.tick,
                    kind: a.telegraph.kind,
                    enemyDamage: proto?.attackDamage ?? 14
                  });
                }
              }
            } else if (a.enemyTypeId === "bomber_imp" && proto) {
              const r2 = proto.attackRange * proto.attackRange;
              for (const t of actors) {
                if (t.kind !== EntityKind.PLAYER) continue;
                if ((t.status & EntityStatus.ALIVE) === 0) continue;
                const dx = t.x - a.x;
                const dy = t.y - a.y;
                if (dx * dx + dy * dy <= r2) {
                  resolveDamage(combatState, {
                    sourceId: a.id,
                    targetId: t.id,
                    amount: 0,
                    tick: world.tick,
                    kind: a.telegraph.kind,
                    enemyDamage: proto.attackDamage
                  });
                }
              }
              a.hp = 0;
              a.status |= EntityStatus.DOWNED;
            } else if (a.enemyTypeId === "gunner_imp" && proto) {
              let target = null;
              let bestSq = Infinity;
              for (const t of actors) {
                if (t.kind !== EntityKind.PLAYER) continue;
                if (!isOutEligibleTarget(t.status)) continue;
                const dx = t.x - a.x;
                const dy = t.y - a.y;
                const dSq = dx * dx + dy * dy;
                if (dSq < bestSq) {
                  bestSq = dSq;
                  target = t;
                }
              }
              if (target) {
                const dx = target.x - a.x;
                const dy = target.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const PROJ_SPEED = 320 / 30;
                projectiles.push({
                  id: projSeq++,
                  x: a.x,
                  y: a.y,
                  vx: dx / len * PROJ_SPEED,
                  vy: dy / len * PROJ_SPEED,
                  ownerId: a.id,
                  damage: proto.attackDamage,
                  // 扁平弹道伤害（取原型 attackDamage）
                  bornTick: world.tick,
                  expireTick: world.tick + 70,
                  // ~2.33s @30Hz 寿命（含穿场地牢余量）
                  radius: 9
                });
              }
            } else {
              const enemyDamage = a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId].attackDamage : void 0;
              const isPlayerSwing = a.kind === EntityKind.PLAYER;
              if (!isPlayerSwing) {
                const target = actors.find(
                  (t) => t.id === a.telegraph.targetId && (t.status & EntityStatus.ALIVE) !== 0
                );
                if (target) {
                  resolveDamage(combatState, {
                    sourceId: a.id,
                    targetId: target.id,
                    amount: 0,
                    tick: world.tick,
                    kind: a.telegraph.kind,
                    enemyDamage
                  });
                  if (a.affix === "lifesteal" && (target.status & EntityStatus.ALIVE) !== 0) {
                    a.hp = Math.min(a.maxHp, a.hp + 2);
                  }
                  if ((target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) && target.hp <= 0 && (target.status & EntityStatus.DOWNED) !== 0) {
                    trySpawnLoot(target, world.tick);
                    if (a.kind === EntityKind.PLAYER) {
                      const proto2 = ENEMY_PROTOTYPES[target.enemyTypeId ?? ""];
                      const xpGain = proto2?.tier === "boss" ? 80 : proto2?.tier === "elite" ? 18 : 6;
                      grantXp(a, xpGain);
                    }
                  }
                }
              } else {
                const mt = actors.find((t) => t.id === a.telegraph.targetId);
                let fx = 1, fy = 0;
                if (mt && Math.hypot(mt.x - a.x, mt.y - a.y) > 1) {
                  const pl = Math.hypot(mt.x - a.x, mt.y - a.y);
                  fx = (mt.x - a.x) / pl;
                  fy = (mt.y - a.y) / pl;
                } else {
                  const coneDir = a.telegraph.dir;
                  if (coneDir && (coneDir.x !== 0 || coneDir.y !== 0)) {
                    const cl = Math.hypot(coneDir.x, coneDir.y) || 1;
                    fx = coneDir.x / cl;
                    fy = coneDir.y / cl;
                  }
                }
                const coneCos = Math.cos(PLAYER_ATTACK_CONE_RAD);
                const aRangePx = PLAYER_ATTACK_RANGE * (a.perkRangeMult ?? 1);
                const rangeSq = aRangePx * aRangePx;
                const mainTargetId = a.telegraph.targetId;
                const hit = (t) => {
                  if (t.kind !== EntityKind.ENEMY && t.kind !== EntityKind.BOSS) return false;
                  if ((t.status & EntityStatus.ALIVE) === 0) return false;
                  const dx = t.x - a.x, dy = t.y - a.y;
                  const dSq = dx * dx + dy * dy;
                  if (dSq > rangeSq) return false;
                  if (t.id === mainTargetId) return true;
                  const dot = dx * fx + dy * fy;
                  if (dSq > 0 && dot < 0) return false;
                  if (dot * dot < coneCos * coneCos * dSq) return false;
                  return true;
                };
                for (const target of actors) {
                  if (!hit(target)) continue;
                  const critRoll = new Rng(
                    hashString64(`crit:${a.id}:${target.id}:${world.tick}`)
                  );
                  const critMult = critRoll.nextInt(0, 99) < 15 ? 1.5 : void 0;
                  resolveDamage(combatState, {
                    sourceId: a.id,
                    targetId: target.id,
                    amount: 0,
                    tick: world.tick,
                    kind: a.telegraph.kind,
                    enemyDamage,
                    critMult
                  });
                  if (target.kind === EntityKind.ENEMY && (target.status & EntityStatus.ALIVE) !== 0 && (target.status & EntityStatus.DOWNED) === 0) {
                    const kdx = target.x - a.x, kdy = target.y - a.y;
                    const kl = Math.hypot(kdx, kdy);
                    const kbScale = target.kind === EntityKind.BOSS ? 0.5 : 1;
                    if (kl > 1) {
                      target.kbUntilTick = world.tick + KNOCKBACK_TICKS;
                      target.kbDirX = kdx / kl * kbScale;
                      target.kbDirY = kdy / kl * kbScale;
                    } else {
                      target.kbUntilTick = world.tick + KNOCKBACK_TICKS;
                      target.kbDirX = fx * kbScale;
                      target.kbDirY = fy * kbScale;
                    }
                  }
                  if ((target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) && target.hp <= 0 && (target.status & EntityStatus.DOWNED) !== 0) {
                    trySpawnLoot(target, world.tick);
                    const proto2 = ENEMY_PROTOTYPES[target.enemyTypeId ?? ""];
                    const xpGain = proto2?.tier === "boss" ? 80 : proto2?.tier === "elite" ? 18 : 6;
                    grantXp(a, xpGain);
                    if (a.perks && a.perks.includes("lifesteal_up")) {
                      a.hp = Math.min(a.maxHp, a.hp + 3);
                    }
                  }
                }
              }
            }
            a.telegraph = null;
          }
        }
        stepProjectiles(combatState);
        for (const a of actors) {
          if (a.enemyTypeId === "brute_charger" && !a.enraged && a.maxHp > 0 && a.hp > 0 && a.hp < a.maxHp * 0.5) {
            a.enraged = true;
            spawnChargerAdd(a, world.tick);
          }
        }
        for (const a of actors) {
          if (a.kind !== EntityKind.PLAYER) continue;
          if ((a.status & EntityStatus.DOWNED) === 0) continue;
          if (a.disconnected) continue;
          a.downedTicks += 1;
          if (a.downedTicks >= DOWNED_TIMEOUT_TICKS) {
            a.status = a.status & ~EntityStatus.DOWNED | EntityStatus.OUT;
            a.rescueTicks = 0;
            a.downedTicks = 0;
            continue;
          }
          const candidates = rescueCandidates(a.id, actors);
          if (candidates.length > 0) {
            if (withinRescueRadius(a, candidates)) {
              a.rescueTicks += 1;
              if (a.rescueTicks >= RESCUE_TICKS) {
                a.status &= ~EntityStatus.DOWNED;
                a.hp = revivalHp(a.maxHp);
                a.rescueTicks = 0;
                a.downedTicks = 0;
              }
            }
          } else {
            if (a.downedTicks >= SOLO_SELF_RESCUE_TICKS) {
              a.status &= ~EntityStatus.DOWNED;
              a.hp = 1;
              a.rescueTicks = 0;
              a.downedTicks = 0;
            }
          }
        }
        {
          const r2 = PICKUP_RADIUS * PICKUP_RADIUS;
          const consumed = /* @__PURE__ */ new Set();
          for (const a of actors) {
            if (a.kind !== EntityKind.PLAYER) continue;
            if ((a.status & EntityStatus.ALIVE) === 0) continue;
            for (const l of actors) {
              if (l.kind !== EntityKind.LOOT) continue;
              if (consumed.has(l.id)) continue;
              const dx = l.x - a.x;
              const dy = l.y - a.y;
              if (dx * dx + dy * dy > r2) continue;
              if (l.lootType === 0) {
                a.hp = Math.min(a.maxHp, a.hp + (l.value ?? 0));
              } else if (l.lootType === 2) {
                a.buffUntilTick = world.tick + LOOT_BUFF_TICKS;
                a.buffMult = 1 + LOOT_BUFF_MULT;
              }
              consumed.add(l.id);
            }
          }
          if (consumed.size > 0) {
            for (let i = actors.length - 1; i >= 0; i--) {
              if (consumed.has(actors[i].id)) actors.splice(i, 1);
            }
          }
        }
        if (spawnEnemiesEnabled) {
          for (let i = actors.length - 1; i >= 0; i--) {
            const a = actors[i];
            if ((a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) && (a.status & EntityStatus.DOWNED) !== 0) {
              actors.splice(i, 1);
            }
          }
          const aliveEnemies = actors.filter(
            (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS
          ).length;
          if (intermissionUntilTick > 0) {
            if (world.tick >= intermissionUntilTick) {
              intermissionUntilTick = 0;
              const nf = layout.floorOfWave[currentWave + 1] ?? currentFloor;
              const prevFloor = currentFloor;
              currentFloor = nf;
              const hasNextFloor = nf > prevFloor;
              if (hasNextFloor && currentWave + 1 < maxWave) {
                openFloorRoute(nf);
                if (pendingFloorRoute) {
                } else {
                  spawnWave(currentWave + 1);
                }
              } else {
                spawnWave(currentWave + 1);
              }
            }
          } else if (aliveEnemies === 0) {
            if (currentWave < maxWave) {
              intermissionUntilTick = world.tick + WAVE_INTERMISSION_TICKS;
              const nextFloor = layout.floorOfWave[currentWave + 1] ?? currentFloor;
              if (nextFloor > lastPerkFloor && nextFloor > 1) {
                lastPerkFloor = nextFloor;
                const prng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:perk:${nextFloor}`));
                const pool = [...PERK_POOL];
                perkChoicesState = [];
                for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
                  const idx = prng.nextInt(0, pool.length - 1);
                  perkChoicesState.push(pool[idx]);
                  pool.splice(idx, 1);
                }
                pickedPerkThisOffer.clear();
              }
            } else {
              currentRoomPhase = RoomPhase.SETTLE;
            }
          }
          if (perkChoicesState.length > 0) {
            const present = actors.filter(
              (a) => a.kind === EntityKind.PLAYER && a.ownerId !== void 0 && !a.disconnected
            );
            const allPicked = present.every((a) => pickedPerkThisOffer.has(a.ownerId));
            if (allPicked) perkChoicesState = [];
          }
        }
        world.tick += 1;
      },
      snapshot() {
        const entities = actors.map((a) => {
          const shape = a.telegraph && a.telegraph.novaRadius != null ? TelegraphShape.AOE_FILL : a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId].shape : TelegraphShape.CONE;
          const isDirectional = shape === TelegraphShape.CONE || shape === TelegraphShape.LINE;
          let teleDir;
          if (isDirectional) {
            if (a.telegraph && a.telegraph.dir && (a.telegraph.dir.x !== 0 || a.telegraph.dir.y !== 0)) {
              const dl = Math.hypot(a.telegraph.dir.x, a.telegraph.dir.y) || 1;
              teleDir = { x: a.telegraph.dir.x / dl, y: a.telegraph.dir.y / dl };
            } else {
              teleDir = dirToVector(a.dir);
            }
          }
          return {
            id: a.id,
            kind: a.kind,
            pos: { x: a.x, y: a.y },
            dir: a.dir,
            hp: a.hp,
            maxHp: a.maxHp,
            status: a.status,
            statusEffects: [],
            ownerId: a.ownerId,
            classId: a.classId,
            enemyTypeId: a.enemyTypeId,
            // AFFIX（P1 精英词缀）：仅 elite 下发（grunt/boss undefined → JSON 丢弃，golden 无损）。
            affix: a.affix ?? void 0,
            // S7.2 救援读条：仅倒地「玩家」附带（敌人倒地不进救援系统；undefined 不影响确定性快照哈希）。
            rescue: a.kind === EntityKind.PLAYER && (a.status & EntityStatus.DOWNED) !== 0 ? {
              targetId: a.id,
              progressTicks: a.rescueTicks,
              totalTicks: RESCUE_TICKS,
              // O3 倒地已过 tick（客户端算「自动复活 / OUT 超时」倒计时；仅倒地玩家下发，
              // 与其他 rescue 字段一致——未倒地实体 rescue 为 undefined，JSON 丢弃，golden 无损）。
              downedTicks: a.downedTicks
            } : void 0,
            // ── E8 / D12 快照序列化（READ-ONLY；纪律 B：绝不改 hp/status，仅公开已存在的权威状态）──
            // 仅当实体真实持有该状态才下发对应字段，否则赋 undefined（JSON.stringify 自动丢弃 undefined
            // 键），故「未持有状态的实体」其确定性哈希不受影响——与 rescue 先例完全一致。
            // D/telegraph 可视化：将运行时 AttackWindup 转换为客户端可读的 TelegraphState
            // （含 shape/color/radius，EntityView.gd 据 radius 缩放预警图形）。
            telegraph: a.telegraph != null ? {
              shape,
              color: DANGER_COLOR,
              startTick: a.telegraph.startTick,
              applyTick: a.telegraph.applyTick,
              // 危险区半径：火焰新星取 novaRadius；敌人取原型 attackRange；玩家普攻预警 = 实际射程。
              radius: a.telegraph && a.telegraph.novaRadius != null ? a.telegraph.novaRadius : a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId].attackRange : PLAYER_ATTACK_RANGE,
              // N2：方向性形状（CONE/LINE）填充攻击者 facing 单位向量；RING/AOE_FILL 省略（undefined）。
              dir: teleDir
            } : void 0,
            // ⑨ SHIELD_ALLY 减伤护盾：仅护盾窗口仍活跃（> world.tick）才下发，过期则 undefined。
            shieldUntilTick: a.shieldUntilTick != null && a.shieldUntilTick > world.tick ? a.shieldUntilTick : void 0,
            shieldReduction: a.shieldUntilTick != null && a.shieldUntilTick > world.tick ? a.shieldReduction : void 0,
            // ⑨ TAUNT 施法者吸引敌火窗口：仅窗口仍活跃（> world.tick）才下发，过期则 undefined。
            tauntUntilTick: a.tauntUntilTick != null && a.tauntUntilTick > world.tick ? a.tauntUntilTick : void 0,
            // C4b 猎手标记易伤窗口：仅窗口仍活跃（> world.tick）才下发，过期/未标记则 undefined（JSON 丢弃，
            // 不影响「未标记实体」的确定性快照哈希——与 rescue/telegraph/shield/taunt/enraged 先例一致）。
            markedUntilTick: a.markedUntilTick != null && a.markedUntilTick > world.tick ? a.markedUntilTick : void 0,
            // 当前/最近施放协作技 id（E8 HUD 提示）。玩家初值 null → undefined → 不下发。
            activeSkill: a.activeSkill ?? void 0,
            // M12：狂暴标记（与 rescue/telegraph 先例一致）。仅当 a.enraged===true 才下发 true，
            // 否则 undefined → JSON.stringify 丢弃键；「未狂暴实体」字节表示不变，确定性哈希不受影响。
            enraged: a.enraged === true ? true : void 0,
            // 掉落（progression/feedback）：仅 loot 实体携带 lootType/value；其他实体为 undefined → 不下发。
            lootType: a.lootType,
            value: a.value,
            // S2 局内 Build（perk）：仅玩家已选 perk 才下发对应字段，未选 → undefined → JSON 丢弃
            // （不影响「无 perk 玩家」的确定性哈希，与 rescue/telegraph 先例一致）。
            perks: a.perks && a.perks.length > 0 ? a.perks : void 0,
            perkDamageMult: a.perkDamageMult ?? void 0,
            perkSpeedMult: a.perkSpeedMult ?? void 0,
            perkMaxHpBonus: a.perkMaxHpBonus ?? void 0,
            // ── G1 升级（仅玩家下发 level/xp；敌人 undefined → JSON 丢弃，golden 无损）──
            level: a.level ?? void 0,
            xp: a.xp ?? void 0,
            // G2 Buff 持续收益：拾取 LOOT buff 的窗口截止 tick（客户端 HUD 显示剩余秒/倍率）。
            buffUntilTick: a.buffUntilTick != null && a.buffUntilTick > world.tick ? a.buffUntilTick : void 0,
            buffMult: a.buffMult ?? void 0,
            // G1 升级特效：本 tick 升级次数（客户端播放金光特效；0/undefined 不下发）。
            levelUpCount: a.levelUpCount != null && a.levelUpCount > 0 ? a.levelUpCount : void 0
          };
        });
        const enemiesRemaining = entities.filter(
          (e) => e.kind === EntityKind.ENEMY || e.kind === EntityKind.BOSS
        ).length;
        return {
          type: "snapshot",
          // C2：数据面路由标记，客户端据 type 区分快照/控制/房间消息（纯新增，旧字段不变）。
          tick: world.tick,
          runId: world.runId,
          roomPhase: world.roomPhase,
          wave: currentWave,
          totalWaves: maxWave,
          intermissionTicks: Math.max(0, intermissionUntilTick - world.tick),
          enemiesRemaining,
          // S2 逐层下行（顶层字段 → golden 仅哈希 entities，不影响确定性）。
          floor: currentFloor,
          totalFloors: layout.floorSequence.length,
          // S2 三选一 Build 可选池（层间「商」点弹出时非空；无商点时空数组）。
          perkChoices: perkChoicesState,
          // ROUTE-PICK（P3）：层间路线选择（intermission 后未决策时非空；客户端弹 UI → CHOOSE_FLOOR）。
          floorChoice: pendingFloorRoute ? pendingFloorRoute.options : null,
          activeRoute: activeFloorRoute ?? null,
          entities,
          // M16：飞行弹道瞬态实体（顶层字段，独立于 entities；golden 仅哈希 entities，故 golden 安全）。
          projectiles: projectiles.map((p) => ({
            id: p.id,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            ownerId: p.ownerId,
            damage: p.damage,
            radius: p.radius
          })),
          lastProcessedSeq: inputs.lastProcessedSeq()
        };
      },
      setDisconnected(playerId, disconnected) {
        const a = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
        if (!a) return;
        if (disconnected && !a.disconnected) {
          a.personalState = capturePersonalState(
            playerId,
            a.status,
            a.hp,
            a.downedTicks,
            a.rescueTicks
          );
        }
        a.disconnected = disconnected;
      },
      applyPerk(playerId, perkId) {
        if (perkChoicesState.length === 0) return false;
        if (!perkChoicesState.includes(perkId)) return false;
        if (pickedPerkThisOffer.has(playerId)) return false;
        const pl = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
        if (!pl) return false;
        const def = PERK_CATALOG[perkId];
        if (!def) return false;
        pl.perks = pl.perks ? [...pl.perks, perkId] : [perkId];
        if (perkId === "dmg_up") pl.perkDamageMult = 1.15;
        else if (perkId === "spd_up") pl.perkSpeedMult = 1.12;
        else if (perkId === "cdr_up") pl.perkCdr = 0.15;
        else if (perkId === "atkspd_up") pl.perkAtkspd = 0.75;
        else if (perkId === "range_up") pl.perkRangeMult = 1.25;
        else if (perkId === "hp_up") {
          pl.perkMaxHpBonus = (pl.perkMaxHpBonus ?? 0) + 20;
          pl.maxHp += 20;
          pl.hp = Math.min(pl.maxHp, pl.hp + 20);
        }
        pickedPerkThisOffer.add(playerId);
        return true;
      },
      skipPerk(playerId) {
        if (perkChoicesState.length === 0) return false;
        if (pickedPerkThisOffer.has(playerId)) return true;
        const pl = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
        if (!pl) return false;
        pickedPerkThisOffer.add(playerId);
        return true;
      },
      perkChoices() {
        return perkChoicesState;
      },
      // S2 测试钩子（仅测试用；生产不暴露）：强制开一个「商」点窗口（确定性三选一）。
      // 用于 S2 单元测试验证 applyPerk 机制，避免依赖「真实推进到 floor 2」（怪海下单刷会死）。
      __debugForcePerkOffer() {
        const prng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:test-perk`));
        const pool = [...PERK_POOL];
        perkChoicesState = [];
        for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
          const idx = prng.nextInt(0, pool.length - 1);
          perkChoicesState.push(pool[idx]);
          pool.splice(idx, 1);
        }
        pickedPerkThisOffer.clear();
        lastPerkFloor = Number.MAX_SAFE_INTEGER;
        return perkChoicesState;
      },
      floor() {
        return currentFloor;
      },
      totalFloors() {
        return layout.floorSequence.length;
      }
    };
    return world;
  }
  return __toCommonJS(world_exports);
})();
