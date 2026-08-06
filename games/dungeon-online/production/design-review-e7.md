# E7 设计评审 + 范围核查（P5-S1-DES-7）

- **路径（建议）**：`games/dungeon-online/production/design-review-e7.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）
- **汇编落盘**：主理人（游承峰）
- **评审对象**：
  - `packages/sim-core/src/rescue.ts`（**新增** ⑪ 纯决策基座：常量 + withinRescueRadius/revivalHp/rescueCandidates/isOutEligibleTarget/capturePersonalState）
  - `packages/sim-core/src/types.ts`（OUT=1<<2 复用；RescueState / PersonalState schema 复用）
  - `packages/sim-core/src/combat.ts`（S7.4 倒地/出局免疫 no-op）
  - `packages/sim-core/src/world.ts`（E7 循环接管 DOWNED/救援/超时/托管 + `World.setDisconnected`）
  - `packages/sim-core/tests/unit/downed-rescue.test.ts`（**新增** 6 例）
- **基线**：`design/ux/ux-spec.md` §0/§3/§5/§7、`art/art-bible.md` §3（DANGER 豁免）、`production/epics.md`(E7 S7.1–S7.7)、`production/design-review-e6.md`（carried-forward O-G6/O-K6/O-C6/O-B6）

> 实跑复验（本评审已独立实跑确认）：sim-core `downed-rescue.test.ts` **6/6 绿 #fail 0**；`world-determinism.test.ts` **3/3 绿 #fail 0**，`GOLDEN_WORLD_HASH = 67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`（与 E6 锁定值逐字符一致）；`GOLDEN_PLAYTEST_HASH = 889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`（playtest-core-loop.mjs，220-tick 含移动+攻击+闪避+击倒，3 次重跑字节相等）。与 team-lead 通报的 sim-core 51/51 / dungeon-server 27/27 / harness 7/7 一致。

---

## 0. 判定摘要

- **判定：PASS**（含 9 条非阻塞观察 / CONCERNS 类，无一项 gate E7 验收；其中 O-A7（solo 5s vs 10s 数值偏差）/ O-G7（rescue 字段序列化须 GDScript 复刻条件）建议进「好玩吗」验证门前补）
- **阻塞项：无**
- **E7 范围**：S7.1 倒地接管（⑦ 触发 DOWNED，本系统接管）✅ / S7.2 救援读条 3s + solo 降级自救 ✅ / S7.4 倒地/出局免疫补刀 ✅ / S7.5 超时→OUT（本局观战）✅ / S7.6 断线托管抓拍 PersonalState + 冻结计时 ✅（服务端状态）/ S7.7 重连无跳变还原（服务端状态就位；room-service 接线 post-review RESOLVED 见 §8，仅客户端插值归 O-E7 / Godot 切片）✅（部分，预期内）
- **未覆盖（正确 defer）**：S7.3 呼救广播（仅状态，完整 ping/语音归 E10）✅ / D8 room-service 接线（C3/C10，**post-review：已由 engineering-lead-6 在 room-service 层落地，见 §8**）✅ / 客户端重连插值（headless，**归 O-E7 / Godot 切片**）✅ / ⑬ HUD 救援环形进度消费（E12 S12.4）✅
- **契约一致性**：E7 阈值 vs ux-spec §0/§5 —— RESCUE_TICKS 90=3s 精确对齐；DOWNED_TIMEOUT 600=20s 命中上界；REVIVAL_HP_RATIO 0.3 / MIN 30 为 P5 初稿；**SOLO_SELF_RESCUE_TICKS 300=10s 与 ux-spec §0「自救 5s」存在 2× 数值偏差**（ux-spec 标注「⑪§4 建议值，非 ADR 待调」，设计意图——合理窗口内复活、非永久死亡——满足）
- **纪律 A/B**：A 无回归（world 仍只读 SpawnPoint[]/proto 数据；rescue.ts 仅 import types.ts 数据 const）；B（rescue.ts 纯决策，绝不改 hp/status；真实落地仅 combat.resolveDamage + world.step；enemy-ai.ts 未被 E7 触碰）经源码 grep + 测试断言确认 —— 实跑 `downed-rescue.test.ts` 6/6 守住
- **RNG(D9)**：golden 双锚点（WORLD 67b358c7… / PLAYTEST 889a6e97…）**均不变**；逻辑仅作用于 PLAYER 且 golden 场景玩家从不 DOWNED，且 `rescue` 字段对未倒地玩家为 `undefined`（JSON.stringify 丢弃）→ 快照哈希逐字节相等；无新增隐藏随机源
- **可访问性**：E7 为纯服务端状态，不触碰 ux-spec §7 断线/RESIDENT 流程；DANGER 豁免无冲突（E7 无视觉序列化、不占 8%）；telegraph 静态可读（P3）不受 E7 影响
- **设计红线**：无主导策略 / 经济失衡 / 认知过载 / 支柱漂移；P4「重连友好 / 不劝退」经 S7.4 免疫补刀 + S7.6 托管冻结计时在服务端落地 ✅

---

## 1. 范围检查

### 1.1 E7 范围核查（S7.1–S7.7）

| 控制项 | 意图（epics E7） | E7 落点 | 结论 |
|---|---|---|---|
| **S7.1 倒地接管** | ⑦ HP≤0 → DOWNED，本系统接管 | `combat.ts` L129 `if (target.hp <= 0) target.status \|= DOWNED`；`world.ts` E7 循环 `if ((a.status & DOWNED) === 0) continue` 接管后续计时/救援/超时 | ✅ 接管全覆盖 |
| **S7.2 救援读条** | 队友邻近累积 → 复活 | `world.ts` L316-328：`rescueCandidates` 过滤 + `withinRescueRadius` 几何判定 → `rescueTicks += 1`；达 `RESCUE_TICKS`(90) 清 DOWNED + `hp = revivalHp(maxHp)` | ✅ 覆盖（不衰减保持见 O-C 澄清） |
| **S7.2 降级分支（solo 自救）** | 无队友 → 自动自救 | `world.ts` L330-338：`candidates.length === 0` → `downedTicks >= SOLO_SELF_RESCUE_TICKS`(300) 清 DOWNED + `hp = 1` 降级 | ✅ 覆盖 |
| **S7.4 倒地/出局免疫** | 免疫补刀致死 | `combat.ts` L117-119：`target.status & (DOWNED\|OUT)` → no-op（deltaHp=0，status 不变）；OUT 仅由超时触发 | ✅ 覆盖（防御性兜底，正常路径敌人已不锁倒地者） |
| **S7.5 超时→OUT** | 窗口未救 → 本局观战 | `world.ts` L307-313：`downedTicks >= DOWNED_TIMEOUT_TICKS`(600) → 清 DOWNED 置 OUT；ALIVE 保留；world reset 才清（sim-core 仅持有） | ✅ 覆盖（仅超时触发，S7.4 保证伤害不进 OUT） |
| **S7.6 托管快照** | 断线抓拍 PersonalState 单次持有 + 跳过 tick + 冻结计时（三者同发，C3·P4） | `world.ts` `setDisconnected` L368-383：置位 `disconnected` 同时 `capturePersonalState`（单次持有）；E7 循环 L303 `if (a.disconnected) continue` 跳过推进 | ✅ 服务端状态覆盖（消费待 room-service，见 O-D7） |
| **S7.7 重连归位还原** | 当前 room 态 + 保留 PersonalState 分离还原，无跳变（C10 部分） | 服务端：`setDisconnected(false)` 后 `downedTicks` 从冻结值续计（test 验证 50→55 不跳变）；客户端/room-service 还原闭环待 E1 S1.6 + room-service 接入 | ✅ 服务端状态就位（部分，预期内） |

### 1.2 未覆盖项（正确 defer，非范围失败）

- **S7.3 呼救广播（经 E10）**：E7 仅落地 DOWNED / 救援进度状态，未广播「急救！」ping/语音/世界内标记；`world.snapshot` 未含呼救信号位（⑩ 接口预留，S7.3 显式依赖 E10）。✅ 预期内（状态层已就绪，信号层归 E10）。
- **D8 room-service 接线（C3/C10 部分）**：`PersonalState` 已在服务端 `setDisconnected` 抓拍（单次持有），但未被 room-service 下发/消费——完整「重连还原」闭环待 room-service（C3）与 E1 S1.6 接入。✅ 预期内（headless 切片不触发）。
- **S7.7 客户端重连插值**：headless 切片不含客户端；100ms 插值还原归 E1 S1.6 + ⑬。✅ 预期内。
- **⑬ HUD 救援环形进度**：`rescue` 字段已序列化进 `EntityState`（types.ts 预声明 `RescueState`），环形进度渲染（art-bible §8 / ux-spec §5）归 E12 S12.4 消费。✅ 预期内（schema 已对齐）。
- **R1 二进制通道 / 客户端预测（S4.2/S4.4）**：E7 未碰传输层/预测；仅扩展服务端状态。✅ 预期内。

### 1.3 超范围检查

- E7 全部限于 ⑪ 救援/倒地/超时/托管（服务端状态 + 纯决策），未实现 ⑩ 信号广播、⑨ 协作技、⑬ HUD、② 职业定类、⑤ 资源、⑫ 结算（团灭判定归 E11）。✅
- `rescue.ts` 不 import `combat`/`world`/`enemy-ai`/`dungeon-gen` 运行时（源码 grep 确认）；`world.ts`（① 编排层）引 `rescue.ts` 纯函数属 ADR D13 授权。✅
- `enemy-ai.ts` 未被 E7 修改（源码 grep：无任何 rescue/downed/out/hp/status 源码改动，仅一处注释提及 DOWNED）。✅
- **结论：E7 未越界，范围与 sprint-1.md / epics.md E7 一致**（含预期内 defer）。

---

## 2. GDD 契约一致性表（E7 实现 vs 上游基线）

| 契约点 | 基线出处 | E7 实现 | 结果 |
|---|---|---|---|
| 救援读条 3s | ux-spec §0（救援读条 3s） | `RESCUE_TICKS=90` @30Hz = 3.0s | ✅ 精确对齐 |
| 倒地窗口 15–20s | ux-spec §0（DOWNED 窗口 15–20s） | `DOWNED_TIMEOUT_TICKS=600` @30Hz = 20.0s | ✅ 命中上界（20s） |
| 自救（solo 降级） | ux-spec §0（自救 5s）/ §5（solo 自救 5s） | `SOLO_SELF_RESCUE_TICKS=300` @30Hz = 10s；复活为 1hp | ⚠ **数值偏差 2×**（5s→10s）；ux-spec 标注「⑪§4 建议值，非 ADR 待调」，设计意图（合理窗口内复活、非永久死亡）满足；建议 P5 钉值（O-A7） |
| 免疫补刀致死 | ux-spec §5 / epics S7.4 | `combat.ts` DOWNED\|OUT → no-op（deltaHp=0）；OUT 仅超时触发 | ✅ 一致（MVP 不做补刀致死） |
| 超时→OUT 本局观战 | ux-spec §5（本局观战，下局重置） | 超时清 DOWNED 置 OUT，ALIVE 保留；world reset 才清 | ✅ 一致（不影响 ALIVE 队友推进；团灭结算归 E11） |
| 救援邻近半径 | ux-spec §5（队友靠近，未钉 px）/ ⑪§4 | `RESCUE_RADIUS=48`（约 1.5 个 32px tile）；欧氏距离平方比较（无随机源） | ✅ P5 初稿（ux-spec 未钉 px，意图「队友靠近」满足） |
| 复活回血 | ⑪§4 平衡初稿（未钉） | `REVIVAL_HP_RATIO=0.3`，下限 `REVIVAL_HP_MIN=30`；`revivalHp = max(30, round(maxHp*0.3))` | ✅ P5 初稿（待「好玩吗」门前复核，O-G7/O-I7） |
| co-op 救援 vs solo 自救 | ux-spec §5（≥2 人队友救援 / solo 自救） | `rescueCandidates` 筛「其他 PLAYER+ALIVE+非DOWNED+非OUT+非断线」；有候选→救援分支，无候选→solo 自救 | ✅ 语义一致（注：有存活队友但始终不靠近 → 走救援分支、不自动自救，20s 超时→OUT；见 O-C7 澄清） |
| 断线托管（D8 三者同发） | ux-spec §7 / epics S7.6（C3·P4） | `setDisconnected` 置位 + `capturePersonalState` 单次持有 + E7 循环跳过 tick 冻结计时 | ✅ 服务端状态覆盖（C3 部分；消费待 room-service，O-D7） |
| 重连无跳变（D8） | ux-spec §7 / ADR D8 / epics S7.7（C10 部分） | 冻结期 `downedTicks` 不动；重连后续计（test：50→55 无跳变）；PersonalState 含剩余窗口 | ✅ 服务端状态就位（C10 部分；客户端还原待 E1 S1.6，O-E7） |
| RESCUE/OUT 位定义 | types `EntityStatus`（OUT=1<<2 紧邻 DOWNED） | `world.ts` 超时 `status = (status & ~DOWNED) \| OUT`；OUT 不经由伤害（S7.4） | ✅ 位运算互斥语义一致 |
| `rescue` 字段序列化 | types `EntityState.rescue?` / `RescueState`（E2 预声明） | `world.snapshot` 仅「倒地 PLAYER」带 `{targetId, progressTicks, totalTicks:RESCUE_TICKS}`，否则 `undefined` | ✅ schema 预声明已对齐（⑬ E12 S12.4 消费；C7 须复刻条件，O-H7） |
| 纪律 B 运行时隔离 | C6 / 源码 | `rescue.ts` 全纯函数；无 hp/status 直改；无 combat/world/enemy-ai/dungeon-gen 运行时 import | ✅ 一致（grep 确认） |
| diff 格式守约 | 纪律 B（consumer 不改 diff 格式） | `EntityState` 仅新增「条件性」`rescue` 字段（预声明）；未倒地玩家无该键（JSON 丢弃 undefined）→ 消费者格式无破坏 | ✅ 无回归（golden 哈希不变佐证） |

---

## 3. 纪律 A / B 检查

**纪律 A（⑤ 只产 SpawnPoint[] / ⑧ 只读；consumer 只读语义）**
- `world.ts`：E7 未改 `createWorld` 生成路径，仍只读 `layout.spawnPoints` 实例化；E7 循环仅消费 actor 坐标与 `EntityStatus`（位运算）。✅
- `rescue.ts`：仅 `import { EntityStatus, EntityKind, type PersonalState } from "./types.ts"` —— `EntityStatus`/`EntityKind` 为数据 const（值），`PersonalState` 为类型；**无运行时函数/生成逻辑 import**。✅
- A 无回归。✅

**纪律 B（rescue.ts 仅 import type + 数据基座，绝不 import combat/world/enemy-ai/dungeon-gen 运行时；只经 resolveDamage 出口；consumer/world 不改 diff 格式）**
- `rescue.ts` 五个导出函数均纯无副作用：
  - `withinRescueRadius`：只读几何（欧氏距离平方），无随机源；
  - `revivalHp`：纯算术 `max(MIN, round(maxHp*RATIO))`；
  - `isOutEligibleTarget`：纯位运算判定；
  - `rescueCandidates`：纯过滤（调 `isOutEligibleTarget`，无状态写）；
  - `capturePersonalState`：纯构造 `PersonalState`（不修改入参）。
  - **源码 grep 确认无 hp=/status= 直改、无 combat/world/enemy-ai/dungeon-gen 运行时 import。** ✅
- **hp/status 唯一落地点**：① `combat.resolveDamage`（S7.4 no-op + hp≤0 置 DOWNED，E5/E6 既有），② `world.step` E7 循环（清 DOWNED / `hp = revivalHp` / `hp = 1` / 置 OUT / 冻结计时）。rescue.ts 全程不触实体。✅
- **enemy-ai.ts 未被 E7 触碰**：源码 grep 确认 E7 未对其做任何 hp/status/rescue 改动；其既有的「玩家只读视图（alive = ALIVE 且非 DOWNED）」注释与 E7 语义同向。✅
- **C11 出口单点**：S7.4 免疫逻辑位于 `combat.resolveDamage`（唯一伤害权威），E7 不另开伤害路径；OUT 仅 `world.step` 超时触发，绝不经由伤害结算。✅
- **diff 格式守约**：`world.snapshot` 仅条件性附加 `rescue`（未倒地玩家为 `undefined` → JSON 丢弃），`EntityState` schema 在 E2 已预声明 `rescue?`；消费者（⑬）格式无破坏，`GOLDEN_WORLD_HASH` 字节相等佐证。✅

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| `GOLDEN_WORLD_HASH` 不变（world-determinism.test.ts） | 实跑 3/3 绿；`67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8` 与 E6 锁定值逐字符相等；断言同 seed(EMBER-S1)+固定输入（含一次 ATTACK）→ 字节级稳定（跨 5 次重跑相等） | ✅ E7 接入后 golden 零回归 |
| `GOLDEN_PLAYTEST_HASH` 不变（playtest-core-loop.mjs） | `889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`；220-tick 含移动+攻击+闪避+击倒核心循环，3 次重跑字节相等 | ✅ 不受影响 |
| golden 场景玩家从不 DOWNED → 逻辑仅作用于 PLAYER | world-determinism（26-tick 仅一次 ATTACK）+ playtest（220-tick）序列均无人 hp≤0；E7 循环 `if ((status&DOWNED)===0) continue` 对非倒地玩家零状态写；「倒地」玩家在 golden 场景不存在 → 快照逐字节一致 | ✅ D9 契约零回归（数学可证） |
| `rescue` 字段对 golden 哈希无影响 | 未倒地玩家 `rescue: undefined`，JSON.stringify 丢弃该键；与 E6（无 rescue 键）序列化结果相同 | ✅ 无哈希扰动（C7 端口须复刻同一条件，见 O-H7） |
| E7 路径无隐藏随机源 | grep：`rescue.ts` 无 Math.random/Date/Rng；`world.ts` E7 循环仅算术（tick 计数 + 位运算 + 欧氏比较），`Rng` 仅用于 `createWorld` 敌人生成抖动（E1/E3 既有，未变） | ✅ |
| 确定性跨端对齐 | sim-core 纯逻辑；golden 双锚点（world / playtest）锁定，便于 GDScript 端口复刻（C7） | ✅ |

> E7 接入倒地/救援/超时/托管后，golden 双锚点均逐字节不变；D9 契约零回归，且可数学证明（golden 场景无倒地玩家 + `rescue` undefined 被 JSON 丢弃）。

---

## 5. 可访问性

**E7 纯服务端状态 vs ux-spec §7 断线 / RESIDENT**
- E7 全部逻辑在权威 world 内结算（DOWNED 计时/救援读条/超时/托管冻结），不触及 PersonalState 抓拍的**下发与客户端还原**路径（那归 room-service + E1 S1.6）；snapshot 仅条件性附加 `rescue`（倒地 PLAYER），`EntityState` schema 预声明无格式破坏 → ux-spec §7 流程不受 E7 破坏。✅
- RESIDENT：公共房断线托管与好友房同算法（冻结计时 + 抓拍），无差异。✅
- **缺口（继承 E6 O-K6 / 新增 O-D7·O-E7）**：重连 seq 连续性契约（O-K6）经 `setDisconnected` hook 部分推进，但 room-service 接线（C3/C10）与客户端插值还原（S7.7 客户端部分）尚未完成；headless 不触发，非阻塞。
- **DANGER 豁免**：E7 无 telegraph/视觉序列化，完全不触碰 art-bible §3「全局 8% 强提醒色预算」；倒地/救援的视觉（环形进度 + 阵营色描边弱化）归 ⑬ E12 + art-bible §8，E7 无交集。✅
- §8 可访问性维度（色盲三重 / 按键重映射 / 减弱动效保留静态预警）均不依赖 E7 服务端状态；P3「读得懂的紧张感」由 D12 telegraph 前摇时延（E6 已锁）保障，E7 倒地/救援为额外可读性反馈层（待 E12 渲染）。✅
- **事件文本化（accessibility #13）**：倒地/救援/出局均需文字提示（不靠音/光），由 ⑬ E12 承接；E7 仅提供状态（DOWNED/救援进度/OUT），不产文字 UI。⚠ 归 E12，非阻塞。

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E7 把「⑪ 救援/倒地/超时/托管」一次闭环：⑦ 触发 DOWNED + S7.4 免疫补刀（no-op），world.step 接管倒地计时/救援读条（3s）/solo 降级自救/超时→OUT（20s 本局观战），`setDisconnected` 三者同发抓拍 PersonalState + 冻结计时（D8·P4）。`rescue.ts` 为纯决策基座（纪律 B，源码 grep + 测试 6/6 守住），`enemy-ai.ts` 未被触碰（纪律 B 无回归），`GOLDEN_WORLD_HASH`/`GOLDEN_PLAYTEST_HASH` 双锚点逐字节不变（D9 零回归，可数学证明）。可放行进入 E8/E9/E10/E11/E12/E13 后续切片。**建议「好玩吗」验证门前补 O-A7（solo 5s vs 10s 钉值）与 O-H7（rescue 字段序列化 GDScript 复刻）/ O-I7（复活下限 30 对低 maxHp 职业）。**

### 6.2 待闭合项 reconcile（O-G6 / O-K6 / O-C6 / O-B6）

- **O-G6（DOWNED 触发后无计时/OUT/救援 → ⑪ E7 RESOLVED）**：E7 已实现 DOWNED→救援/超时→OUT/免疫补刀全链；`downed-rescue.test.ts` 6 例覆盖 S7.2/S7.4/S7.5/S7.6/S7.7。✅ RESOLVED（关闭）。
- **O-K6（重连 seq 连续性契约 → PARTIALLY PROGRESSED【post-review：服务端接线 RESOLVED，见 §8】）**：E7 新增 `setDisconnected` hook 抓拍 PersonalState（单次持有）+ 冻结计时，服务端状态就位；room-service 接线（C3/C10）已由 engineering-lead-6 在 room-service 层落地（`markDisconnected`/`validateReconnect` → `world.setDisconnected`，d8 端到端测试双证）。跨断线 seq 不重置客户端契约归属 O-E7（Godot 客户端切片），未做——保持 OPEN 客户端闭环部分。详见 §8。
- **O-C6（范围/权威位置命中校验未做 → 仍 OPEN，E7 未新增）**：E7 救援用 `RESCUE_RADIUS` 几何判定（独立机制），未补 combat 命中距离重校；O-C6 原指「敌人 windup 后对 targetId 直结算不重校距离」，E7 不触及该路径，范围重校仍待「好玩吗」门前。⚠ 仍 OPEN（继承 E5/E6，非 E7 回归）。
- **O-B6（碰撞未做 → 仍 OPEN，E7 未新增）**：E7 救援半径判定为纯几何（无视地形/实体碰撞层），玩家可隔墙读条；碰撞层约束（S5.2/S6.2）仍归独立碰撞 epic。⚠ 仍 OPEN（继承 E5/E6，非阻塞）。

### 6.3 非阻塞观察（CONCERNS 类，不 gate E7，供下游 epic 跟踪）

- **O-A7 · solo 自救 5s(ux-spec) vs 10s(E7) 数值偏差（P5 调优）**：`SOLO_SELF_RESCUE_TICKS=300`=10s，而 ux-spec §0/§5 标注「自救 5s」。ux-spec 明示该值为「⑪§4 建议值，非 ADR 待调」，E7 满足设计意图（合理窗口内复活、非永久死亡）；但建议 P5 在 ⑪ GDD 钉定权威值（5s 或 10s），并同步回 ux-spec §0，避免双源不一致。非阻塞。
- **O-B7 · 敌人 AI 借 `isOutEligibleTarget` 排除 DOWNED/OUT 目标（设计意图澄清）**：`world.ts` L249 复用 rescue.ts 的 `isOutEligibleTarget` 过滤敌人攻击目标 → 倒地玩家不被追击。这比 ux-spec §5 字面「敌可持续攻击但仅维持 DOWNED 计时」更 P4 友好（倒地者免受扰），且与 S7.4 no-op（致死免疫）无功能冲突；但字面措辞暗示「敌继续攻击倒地者以制造救援紧迫」。建议 ⑪ GDD 澄清：敌人是否应继续攻击倒地玩家（紧迫感）还是转火存活者（友好），并确认 `isOutEligibleTarget` 复用是否为预期行为。非阻塞（功能正确）。
- **O-C7 · co-op 倒地 + 存活队友但远离 → 走救援分支、不自动自救（⑪ GDD 语义澄清）**：`rescueCandidates` 返回非空（有存活队友）→ 不触发 solo 自救，倒地玩家依赖队友靠近（48px 内累积 90 tick）；若队友始终不靠近，20s 超时→OUT。这与 ux-spec「solo 自救」语义一致（solo=无候选队友），但玩家可能误判「有队友即可自动自救」。建议在 ⑪ GDD 显式写明「有队友时=依赖队友救援；仅当无候选队友（全灭/全断线/真·solo）才自动自救」。非阻塞。
- **O-D7 · D8 room-service 接线（C3/C10）——【post-review 更新：RESOLVED，见 §8】**：原评审时 `PersonalState` 已在服务端 `setDisconnected` 抓拍（单次持有），但未被 room-service 下发/消费；完整「重连还原」闭环待 room-service 接入。后由 engineering-lead-6 在 room-service 层落地 `markDisconnected → world.setDisconnected(seatIndex, true)` 与 `validateReconnect → world.setDisconnected(seatIndex, false)` 路由，并以 `apps/dungeon-server/tests/d8-disconnect-wiring.test.ts` 端到端证明（spy + World actor 状态双证，1/1 通过）；未改动 sim-core 任何代码。详见 §8。
- **O-E7 · S7.7 客户端重连插值未纳入 headless 切片**：服务端状态（冻结计时 + PersonalState 抓拍）已就位，保证重连无跳变；客户端 100ms 插值还原归 E1 S1.6 + ⑬。非阻塞（预期内 defer）。
- **O-F7 · S7.3 呼救广播未实现（归 E10）**：E7 仅落地 DOWNED/救援进度状态，未广播「急救！」ping/语音/世界内标记；`world.snapshot` 未含呼救信号位（⑩ 接口预留，S7.3 显式依赖 E10）。建议 E10 接入时复用 E7 的 DOWNED 状态作为呼救触发源。非阻塞。
- **O-G7 · `rescue` 字段已序列化进 EntityState（C7 端口须复刻条件）**：`world.snapshot` 对倒地 PLAYER 附加 `{targetId, progressTicks, totalTicks}`，否则 `undefined`。⑬ E12 S12.4 将消费 `progressTicks/totalTicks` 渲染环形进度；GDScript 端口（C7）**必须**复刻「仅倒地 PLAYER 带 rescue」条件，否则 `GOLDEN_WORLD_HASH` 对齐失败（本次 golden 安全因 undefined 被 JSON 丢弃）。非阻塞（schema 预声明已对齐）。
- **O-H7 · 阈值全为 P5 平衡初稿（待「好玩吗」门前复核）**：`RESCUE_RADIUS 48` / `RESCUE_TICKS 90` / `SOLO_SELF_RESCUE_TICKS 300` / `DOWNED_TIMEOUT_TICKS 600` / `REVIVAL_HP_RATIO 0.3` / `REVIVAL_HP_MIN 30` 全标注「P5 平衡初稿」；建议与 E6 O-E6（敌人平衡初稿）一并进「好玩吗」验证门前做端到端手感调参。非阻塞。
- **O-I7 · REVIVAL_HP_MIN=30 对低 maxHp 职业偏脆（P5 评估）**：ranger(80)/mage(90) 复活 hp = max(30, round(maxHp*0.3)) = 30（命中下限）；30hp 在敌群中仍极脆。建议 P5 评估是否按职业缩放或提高下限（tank 140→42、healer 100→30）。非阻塞（平衡初稿，待调）。

### 6.4 阻塞项：**无**

---

## 7. Handoff
- 本稿随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-e7.md`。
- E7 验收建议放行；O-A7–O-I7 记入下游 epic 待办，不阻断 Sprint 1 推进；**O-A7（solo 5s vs 10s）/ O-G7（rescue 序列化 GDScript 复刻）/ O-I7（复活下限）建议作为「好玩吗」验证门前补**；O-G6 已 RESOLVED（关闭）、O-K6 服务端接线 post-review RESOLVED（见 §8）、O-C6/O-B6 仍 OPEN（继承）。
- 下一步（按 sprint-1 顺序）：E2✅ E1✅ E3✅ E4✅ E5✅ E6✅ → **E7✅** → E8（⑨ 闭合 O-A 协作技）+ E9（⑥）+ E10（⑩ 闭合 O-F7 呼救广播）+ E11（⑫ 闭合团灭结算）+ E12（⑬ 闭合 O-G7 救援环形进度 + O-? 事件文本化）+ E13（C9/C1 回填，闭合 O-A7 双源不一致）。
- 跨队友提示：
  - **O-D7（D8 room-service 接线）post-review 已由 engineering-lead-6 RESOLVED（见 §8）；O-E7（O-K6 客户端闭环）**仍建议主理人排入 Godot 客户端切片 / 联机 epic（C10 客户端部分）；**O-C7/O-B7 语义澄清**建议 design-strategist（⑪ GDD）在 E13 前定稿。
  - **O-G7（rescue 字段序列化）**建议主理人协调 engineering-lead 在 GDScript 端口（C7）复刻「仅倒地 PLAYER 带 rescue」条件；**O-H7/O-I7（平衡初稿）**建议排入「好玩吗」验证门前。
  - art-bible §3 DANGER 豁免与 E7 无交集（E7 无视觉序列化），无需改动 art-director 文档；可访问性维度（§5/§8）无改动（事件文本化归 E12）。
  - **quality-lead**：E7 测试面（`downed-rescue.test.ts` 6/6、`world-determinism.test.ts` 3/3、`GOLDEN_PLAYTEST_HASH` 稳定）建议 QA 计划补「救援半径几何边界（刚好 48px 内/外）/ 多倒地玩家互救死锁 / 断线期间敌人是否转火」用例并回归；O-C7/O-B7 设计语义用例建议进「好玩吗」门前。

（文策渊 · design-strategist · E7 设计评审，主理人汇编落盘）

---

## 8. 后续状态更新（post-review 补充，非评审时点结论）

> 本 § 为评审落盘后（E7 评审判定 PASS 时点之后）的下游进展补充，**不改变 §0 的 PASS 判定与「无阻塞项」结论**；仅更新原 §6.2 / §6.3 中 O-D7 / O-K6 的下游状态，供后续 epic 与团队查阅。来源：engineering-lead-6 通报 + design-strategist 独立实跑复验。

### 8.1 O-D7（D8 room-service 接线，C3/C10）→ RESOLVED（post-review，engineering-lead-6 落地）
- **落点**：`room-service.markDisconnected(room, userId)` 路由到 `world.setDisconnected(seatIndex, true)`（断线三者同发：跳过 tick + 暂停 DOWNED/救援计时 + 抓拍 PersonalState）；`room-service.validateReconnect(room, userId, seatIndex, token, runId)` 路由到 `world.setDisconnected(seatIndex, false)`（重连无跳变恢复，计时从剩余窗口续算）。
- **身份映射**：房间座位 `seatIndex ≡ actor.ownerId ≡ World 玩家 id`（见 protocol.ts game.start），故断开/重连以 seatIndex 驱动 `world.setDisconnected`，无歧义。
- **验证（design-strategist 独立实跑复验）**：
  - `apps/dungeon-server/tests/d8-disconnect-wiring.test.ts` **1/1 通过** —— spy 记录 `setDisconnected` 调用（确认 hook 真实触发，非橡皮图章）+ 读取 `World` actor `disconnected` 状态双证；玩家 B 全程不受影响；`reconnectToken` 重发。
  - 全量回归（engineering-lead-6 通报，与评审时点一致）：dungeon-server 28/28、sim-core 51/51、playtest 7/7 EXIT 0。
  - **golden 重确认（本人实跑）**：`downed-rescue.test.ts` 6/6 + `world-determinism.test.ts` 3/3 = 9/9 #fail 0；`GOLDEN_WORLD_HASH = 67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`、`GOLDEN_PLAYTEST_HASH = 889a6e97…` 均不变 → 印证「未在 sim-core 改动任何代码」，D9 契约零回归。
- **结论**：O-D7 服务端接线关闭（C3 收口）；客户端/房间态下发业务仍归 room-service 既有路径，本评审无需再追。

### 8.2 O-K6（重连 seq 连续性契约）→ 服务端接线 RESOLVED（post-review），仅剩 O-E7 客户端闭环
- `setDisconnected` hook（E7 评审时点已就位）现由 room-service 在断线/重连路径真实驱动，PersonalState 抓拍 + 计时冻结/恢复已端到端打通（d8 测试双证）。
- **仍 OPEN**：O-E7（S7.7 客户端重连插值，100ms 平滑还原）属 Godot 客户端切片，未做；跨断线 seq 不重置客户端契约待客户端切片落地时显式约定。与评审时点判定一致。
- **结论**：O-K6 服务端侧（C10 服务端部分）关闭；O-E7 维持 OPEN（预期内 defer，归 Godot 切片）。

### 8.3 评审时点判定不受影响
- §0「判定：PASS / 无阻塞项」在评审时点成立，现仍成立：O-D7 / O-K6 原即非阻塞（headless 不触发），其下游收口不改变 E7 验收放行结论。
- D8 接线**未提交 git**（engineering-lead-6 通报）；建议主理人在合入时一并确认本 § 状态，并将「联机 playtest 前必补项」由 O-D7 降级为 O-E7（仅客户端插值）。

（文策渊 · design-strategist · E7 设计评审，主理人汇编落盘；§8 post-review 补充 by design-strategist-6）
