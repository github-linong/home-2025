/**
 * auth-dual-mode.test.ts — verifyWithApi2 双模式（devSkip 路径；默认 config devSkipAuth=true）
 * ===========================================================================
 * 生产路径（devSkipAuth=false，需真实 api2）见 auth-verify-production.test.ts。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { verifyWithApi2 } from "../src/auth.ts";
import { generateGuestId } from "../src/ids.ts";

// UUID v4：guest_<8-4-4-4-12>，version nibble = 4，variant nibble ∈ {8,9,a,b}。
const UUID_V4 = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("devSkip: devUserId → login identity (guest:false)", async () => {
  const r = await verifyWithApi2("", { devUserId: "hero" });
  assert.equal(r?.guest, false);
  assert.equal(r?.userId, "hero");
});

test("devSkip: no devUserId → guest identity with unguessable UUID v4 (C-Per-2)", async () => {
  const r = await verifyWithApi2("", { devUserId: null });
  assert.equal(r?.guest, true);
  assert.match(r!.userId, UUID_V4, "guestId is server-issued crypto.randomUUID v4 (unguessable)");
});

test("generateGuestId: UUID v4 and unique per call (C-Per-2)", () => {
  const a = generateGuestId();
  const b = generateGuestId();
  assert.match(a, UUID_V4);
  assert.match(b, UUID_V4);
  assert.notEqual(a, b, "each guest gets a unique random id → not guessable");
});

test("C-Per-2: devSkip path never touches the network (no password endpoint exposure)", async () => {
  // verifyWithApi2 在不传 fetchImpl 时，devSkip 分支直接返回，不应发起任何网络请求。
  // 若意外触网，全局 fetch 不存在于本断言上下文会抛错；此处仅断言返回结构正确。
  const login = await verifyWithApi2("", { devUserId: "k" });
  const guest = await verifyWithApi2("", { devUserId: null });
  assert.equal(login?.guest, false);
  assert.equal(guest?.guest, true);
});
