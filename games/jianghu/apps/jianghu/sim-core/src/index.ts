/**
 * index.ts — sim-core 公共出口（供 server / 未来客户端 codegen 消费，C7 单一来源）
 */
export * from "./constants.ts";
export * from "./types.ts";
export * from "./rng.ts";
export * from "./world.ts";
export * from "./movement.ts";
export * from "./parry.ts";
export * from "./combat.ts";
export * from "./loot.ts";
export * from "./affixes.ts"; // E7：词缀表 / 物品原型 / 装备属性
export * from "./dungeonGen.ts";
export * from "./spawning.ts";
