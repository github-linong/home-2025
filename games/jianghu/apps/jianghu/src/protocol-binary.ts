/**
 * protocol-binary.ts — 数据面二进制协议（E1.S1.2 / C3 / C4 / C12）
 * ===========================================================================
 * 传输双平面（C3）：控制面 JSON（protocol.ts，显式 "type"）/ 数据面二进制（本文件，ws.send(Buffer)）。
 *
 * 最小帧格式（C4 / architecture §6）：
 *   [msgType: u8][tick: u32 LE][entityCount: u16 LE]
 *   + 每实体 [id: u16][changeMask: u16] + 按 changeMask 条件序列化的字段
 *
 * 禁止形状猜测路由（C4）：帧首字节 msgType 显式判别数据面消息类型（目前仅 SNAPSHOT）。
 * 条件序列化（C12）：changeMask 位决定哪些可选字段本帧下发，未持有字段不下发，
 *   保证「未持有状态的实体」其二进制表示的确定性（与 JSON 自动丢 undefined 等价）。
 *
 * 编码/解码对称，配套 binary-protocol.test.ts 做 round-trip + 类型判别断言。
 */

import type { EntityState, WorldSnapshot } from "../sim-core/src/types.ts";

/** 数据面消息类型（帧首字节 msgType 显式判别，禁止形状猜测路由）。 */
export const MsgType = {
  /** 状态快照 diff（默认全量，E1 占位；后续 E2 改为 delta）。 */
  SNAPSHOT: 0x01,
} as const;
export type MsgTypeValue = (typeof MsgType)[keyof typeof MsgType];

/** changeMask 位布局（决定每实体下发的字段集合）。 */
export const ChangeBit = {
  POS: 1 << 0,
  KIND: 1 << 1,
  DIR: 1 << 2,
  VITALS: 1 << 3, // hp, maxHp, status
  STATUS_EFFECTS: 1 << 4,
  OWNER: 1 << 5,
  PARRY: 1 << 6,
  LOOT: 1 << 7,
  TELEGRAPH: 1 << 8,
  ENTRANCE: 1 << 9,
  TIER: 1 << 10,
  SKILL_CD: 1 << 11,
  ATTRS: 1 << 12,
} as const;

// ----------------------------- 写入辅助 -----------------------------

class BufWriter {
  private chunks: Buffer[] = [];
  u8(v: number): void {
    const b = Buffer.allocUnsafe(1);
    b.writeUInt8(v & 0xff, 0);
    this.chunks.push(b);
  }
  u16(v: number): void {
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16LE(v & 0xffff, 0);
    this.chunks.push(b);
  }
  i16(v: number): void {
    const b = Buffer.allocUnsafe(2);
    b.writeInt16LE(v, 0);
    this.chunks.push(b);
  }
  u32(v: number): void {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.chunks.push(b);
  }
  done(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

class BufReader {
  private off = 0;
  private readonly buf: Buffer;
  constructor(buf: Buffer) {
    this.buf = buf;
  }
  u8(): number {
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }
  u16(): number {
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  i16(): number {
    const v = this.buf.readInt16LE(this.off);
    this.off += 2;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
}

function encodeEntity(e: EntityState): Buffer {
  const w = new BufWriter();
  let mask = 0;

  // 始终下发的核心字段（POS 必须有，否则客户端不知位置）。
  mask |= ChangeBit.POS;
  w.u16(e.id);
  w.u16(mask); // 占位，最后回填
  w.i16(e.pos.x);
  w.i16(e.pos.y);

  w.u8(e.kind);
  mask |= ChangeBit.KIND;
  w.u8(e.dir);
  mask |= ChangeBit.DIR;
  w.u16(e.hp);
  w.u16(e.maxHp);
  w.u16(e.status);
  mask |= ChangeBit.VITALS;

  // statusEffects
  w.u8(e.statusEffects.length);
  for (const s of e.statusEffects) {
    w.u8(s.type);
    w.u16(s.remainingTicks);
  }
  mask |= ChangeBit.STATUS_EFFECTS;

  if (e.ownerId !== undefined) {
    w.u16(e.ownerId);
    mask |= ChangeBit.OWNER;
  }
  if (e.parryState !== undefined) {
    w.u8(e.parryState.active ? 1 : 0);
    w.u32(e.parryState.windowEndTick);
    mask |= ChangeBit.PARRY;
  }
  if (e.loot !== undefined) {
    w.u32(e.loot.itemId);
    w.u8(e.loot.rarity);
    w.u8(e.loot.affixes.length);
    for (const a of e.loot.affixes) w.u8(a & 0xff);
    w.u16(e.loot.ttlTicks);
    mask |= ChangeBit.LOOT;
  }
  if (e.telegraph !== undefined) {
    w.u8(e.telegraph.shape);
    w.u8(e.telegraph.color);
    w.u32(e.telegraph.startTick);
    w.u32(e.telegraph.applyTick);
    w.u16(e.telegraph.radius);
    mask |= ChangeBit.TELEGRAPH;
  }
  if (e.entrance !== undefined) {
    w.u16(e.entrance.cooldownTicks);
    w.u32(e.entrance.lastUsedTick);
    mask |= ChangeBit.ENTRANCE;
  }
  if (e.tier !== undefined) {
    w.u8(e.tier);
    mask |= ChangeBit.TIER;
  }
  if (e.skillCd !== undefined) {
    for (let i = 0; i < 4; i++) w.u16(e.skillCd[i] ?? 0);
    mask |= ChangeBit.SKILL_CD;
  }
  if (e.attrs !== undefined) {
    w.u8(e.attrs.str);
    w.u8(e.attrs.dex);
    w.u8(e.attrs.vit);
    // E7：可选扩展字段（atk/maxHp/crit 千分比；仅当全部存在才编码，C12 条件序列化）。
    const hasExt = e.attrs.atk !== undefined && e.attrs.maxHp !== undefined && e.attrs.crit !== undefined;
    w.u8(hasExt ? 1 : 0);
    if (hasExt) {
      w.u16(e.attrs.atk!);
      w.u16(e.attrs.maxHp!);
      w.u16(e.attrs.crit!);
    }
    mask |= ChangeBit.ATTRS;
  }

  // 回填 changeMask（覆盖占位）。
  const out = w.done();
  out.writeUInt16LE(mask & 0xffff, 2);
  return out;
}

function decodeEntity(r: BufReader): EntityState {
  const id = r.u16();
  const mask = r.u16();
  const pos = { x: r.i16(), y: r.i16() };
  const kind = r.u8() as EntityState["kind"];
  const dir = r.u8();
  const hp = r.u16();
  const maxHp = r.u16();
  const status = r.u16();
  const seCount = r.u8();
  const statusEffects: { type: number; remainingTicks: number }[] = [];
  for (let i = 0; i < seCount; i++) statusEffects.push({ type: r.u8(), remainingTicks: r.u16() });

  // 逐条件字段读取到本地变量（避免对已构建的只读 EntityState 做后置赋值）。
  let ownerId: number | undefined;
  let parryState: { active: boolean; windowEndTick: number } | undefined;
  let loot: { itemId: number; rarity: number; affixes: number[]; ttlTicks: number } | undefined;
  let telegraph: { shape: number; color: number; startTick: number; applyTick: number; radius: number } | undefined;
  let entrance: { cooldownTicks: number; lastUsedTick: number } | undefined;
  let tier: number | undefined;
  let skillCd: number[] | undefined;
  let attrs: { str: number; dex: number; vit: number; atk?: number; maxHp?: number; crit?: number } | undefined;

  if (mask & ChangeBit.OWNER) ownerId = r.u16();
  if (mask & ChangeBit.PARRY) {
    parryState = { active: r.u8() === 1, windowEndTick: r.u32() };
  }
  if (mask & ChangeBit.LOOT) {
    const itemId = r.u32();
    const rarity = r.u8();
    const affixCount = r.u8();
    const affixes: number[] = [];
    for (let i = 0; i < affixCount; i++) affixes.push(r.u8());
    const ttlTicks = r.u16();
    loot = { itemId, rarity, affixes, ttlTicks };
  }
  if (mask & ChangeBit.TELEGRAPH) {
    telegraph = {
      shape: r.u8(),
      color: r.u8(),
      startTick: r.u32(),
      applyTick: r.u32(),
      radius: r.u16(),
    };
  }
  if (mask & ChangeBit.ENTRANCE) {
    entrance = { cooldownTicks: r.u16(), lastUsedTick: r.u32() };
  }
  if (mask & ChangeBit.TIER) tier = r.u8();
  if (mask & ChangeBit.SKILL_CD) {
    skillCd = [r.u16(), r.u16(), r.u16(), r.u16()];
  }
  if (mask & ChangeBit.ATTRS) {
    const str = r.u8();
    const dex = r.u8();
    const vit = r.u8();
    // E7：可选扩展字段（hasExt 标志 + u16×3 atk/maxHp/crit 千分比）。
    if (r.u8() === 1) {
      attrs = { str, dex, vit, atk: r.u16(), maxHp: r.u16(), crit: r.u16() };
    } else {
      attrs = { str, dex, vit };
    }
  }

  // 单次字面量构造：EntityState 的条件字段为只读，仅可在字面量初始化时赋值（满足 C12 只读契约）。
  const e: EntityState = {
    id,
    kind,
    pos,
    dir,
    hp,
    maxHp,
    status,
    statusEffects,
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(parryState !== undefined ? { parryState } : {}),
    ...(loot !== undefined ? { loot } : {}),
    ...(telegraph !== undefined ? { telegraph } : {}),
    ...(entrance !== undefined ? { entrance } : {}),
    ...(tier !== undefined ? { tier } : {}),
    ...(skillCd !== undefined ? { skillCd } : {}),
    ...(attrs !== undefined ? { attrs } : {}),
  };
  return e;
}

// ----------------------------- 公共 API -----------------------------

/** 编码世界快照为二进制帧（[msgType:u8][tick:u32][entityCount:u16] + 实体）。 */
export function encodeSnapshot(snap: WorldSnapshot): Buffer {
  const head = new BufWriter();
  head.u8(MsgType.SNAPSHOT);
  head.u32(snap.tick);
  head.u16(snap.entities.length);
  const parts = [head.done()];
  for (const e of snap.entities) parts.push(encodeEntity(e));
  return Buffer.concat(parts);
}

/** 解码二进制帧 → WorldSnapshot（round-trip 用）。 */
export function decodeSnapshot(buf: Buffer): WorldSnapshot {
  const r = new BufReader(buf);
  const msgType = r.u8();
  if (msgType !== MsgType.SNAPSHOT) {
    throw new Error(`unknown binary msgType: 0x${msgType.toString(16)}`);
  }
  const tick = r.u32();
  const count = r.u16();
  const entities: EntityState[] = [];
  for (let i = 0; i < count; i++) entities.push(decodeEntity(r));
  // roomId / phase 不在数据面帧内（控制面 room.snapshot 已承载房间元数据）；
  // 解码时由调用方回填（run-manager 已知 roomId/phase）。
  return { tick, roomId: "", phase: 0, entities };
}

/** 仅取帧首 [msgType:u8]（供网关按类型分派数据面，C4 禁止形状猜测）。 */
export function peekMsgType(buf: Uint8Array): number {
  return buf[0];
}
