/**
 * binary-protocol.test.ts — 数据面二进制协议（C3 / C4 / C12）
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeSnapshot,
  decodeSnapshot,
  peekMsgType,
  MsgType,
  ChangeBit,
} from "../src/protocol-binary.ts";
import { EntityKind, EntityStatus, RoomPhase, type EntityState, type WorldSnapshot } from "../sim-core/src/types.ts";

function makeSnapshot(entities: EntityState[]): WorldSnapshot {
  return { tick: 7, roomId: "room_resident_public", phase: RoomPhase.OVERWORLD, entities };
}

test("frame header: first byte is msgType (C4 explicit discrimination)", () => {
  const snap = makeSnapshot([
    { id: 1, kind: EntityKind.ENTRANCE, pos: { x: 0, y: 0 }, dir: 0, hp: 1, maxHp: 1, status: EntityStatus.ALIVE, statusEffects: [] },
  ]);
  const buf = encodeSnapshot(snap);
  assert.equal(peekMsgType(buf), MsgType.SNAPSHOT);
  assert.equal(buf[0], 0x01);
});

test("round-trip: basic entity survives encode/decode", () => {
  const e: EntityState = {
    id: 42,
    kind: EntityKind.PLAYER,
    pos: { x: 960, y: 720 },
    dir: 3,
    hp: 80,
    maxHp: 100,
    status: EntityStatus.ALIVE | EntityStatus.PARRY_ACTIVE,
    statusEffects: [{ type: 1, remainingTicks: 5 }],
    ownerId: 0,
  };
  const buf = encodeSnapshot(makeSnapshot([e]));
  const out = decodeSnapshot(buf);
  assert.equal(out.tick, 7);
  assert.equal(out.entities.length, 1);
  const d = out.entities[0];
  assert.equal(d.id, 42);
  assert.equal(d.kind, EntityKind.PLAYER);
  assert.deepEqual(d.pos, { x: 960, y: 720 });
  assert.equal(d.dir, 3);
  assert.equal(d.hp, 80);
  assert.equal(d.maxHp, 100);
  assert.equal(d.status, EntityStatus.ALIVE | EntityStatus.PARRY_ACTIVE);
  assert.equal(d.ownerId, 0);
});

test("conditional serialization: parryState / loot / telegraph / entrance only when held (C12)", () => {
  const ent: EntityState = {
    id: 1,
    kind: EntityKind.LOOT_GROUND,
    pos: { x: 48, y: 48 },
    dir: 0,
    hp: 1,
    maxHp: 1,
    status: EntityStatus.ALIVE,
    statusEffects: [],
    loot: { itemId: 1234, rarity: 2, affixes: [7, 9], ttlTicks: 800 },
  };
  const buf = encodeSnapshot(makeSnapshot([ent]));
  // 解码后 changeMask 应含 LOOT 位、不含 PARRY/TELEGRAPH/ENTRANCE。
  const out = decodeSnapshot(buf);
  const d = out.entities[0];
  assert.ok(d.loot, "loot present when held");
  assert.equal(d.loot?.itemId, 1234);
  assert.deepEqual(d.loot?.affixes, [7, 9]);
  assert.equal(d.loot?.ttlTicks, 800);
  assert.equal(d.parryState, undefined, "parry omitted when not held");
  assert.equal(d.telegraph, undefined);
  assert.equal(d.entrance, undefined);
});

test("conditional serialization: ENTRANCE + PARRY round-trip", () => {
  const ent: EntityState = {
    id: 5,
    kind: EntityKind.ENTRANCE,
    pos: { x: 960, y: 720 },
    dir: 0,
    hp: 1,
    maxHp: 1,
    status: EntityStatus.ALIVE,
    statusEffects: [],
    entrance: { cooldownTicks: 120, lastUsedTick: 3 },
  };
  const buf = encodeSnapshot(makeSnapshot([ent]));
  const d = decodeSnapshot(buf).entities[0];
  assert.deepEqual(d.entrance, { cooldownTicks: 120, lastUsedTick: 3 });
  assert.equal(d.loot, undefined);
});

test("multi-entity frame: entityCount encoded in header", () => {
  const ents: EntityState[] = [1, 2, 3].map((i) => ({
    id: i,
    kind: EntityKind.LOOT_GROUND,
    pos: { x: i * 48, y: i * 48 },
    dir: 0,
    hp: 1,
    maxHp: 1,
    status: EntityStatus.ALIVE,
    statusEffects: [],
  }));
  const buf = encodeSnapshot(makeSnapshot(ents));
  const out = decodeSnapshot(buf);
  assert.equal(out.entities.length, 3);
  assert.deepEqual(out.entities.map((e) => e.id), [1, 2, 3]);
});

test("decode rejects unknown msgType (C4: no shape-guessing)", () => {
  const bad = Buffer.from([0x99, 0, 0, 0, 0, 0, 0]);
  assert.throws(() => decodeSnapshot(bad), /unknown binary msgType/);
});

test("changeMask bit layout is stable", () => {
  assert.equal(ChangeBit.POS, 1 << 0);
  assert.equal(ChangeBit.PARRY, 1 << 6);
  assert.equal(ChangeBit.LOOT, 1 << 7);
  assert.equal(ChangeBit.ENTRANCE, 1 << 9);
});

test("E7: ATTRS extended fields (atk/maxHp/crit) round-trip", () => {
  const ent: EntityState = {
    id: 9,
    kind: EntityKind.PLAYER,
    pos: { x: 768, y: 720 },
    dir: 0,
    hp: 132,
    maxHp: 132,
    status: EntityStatus.ALIVE,
    statusEffects: [],
    ownerId: 1,
    attrs: { str: 5, dex: 5, vit: 5, atk: 18, maxHp: 132, crit: 240 },
  };
  const buf = encodeSnapshot(makeSnapshot([ent]));
  const d = decodeSnapshot(buf).entities[0];
  assert.deepEqual(d.attrs, { str: 5, dex: 5, vit: 5, atk: 18, maxHp: 132, crit: 240 }, "extended attrs round-trip");
});

test("E7: ATTRS without extended fields (legacy) round-trip", () => {
  const ent: EntityState = {
    id: 10,
    kind: EntityKind.PLAYER,
    pos: { x: 768, y: 720 },
    dir: 0,
    hp: 100,
    maxHp: 100,
    status: EntityStatus.ALIVE,
    statusEffects: [],
    ownerId: 2,
    attrs: { str: 5, dex: 5, vit: 5 },
  };
  const buf = encodeSnapshot(makeSnapshot([ent]));
  const d = decodeSnapshot(buf).entities[0];
  assert.deepEqual(d.attrs, { str: 5, dex: 5, vit: 5 }, "legacy attrs round-trip (no ext)");
});
