# A2/A3 质量门计划 · 客户端插值打磨 + 预警/协作技可视化

**路径**：`production/qa-plan-a2-a3.md` ｜ **作者**：严守真（quality-lead）｜ **状态**：已落盘（Phase 5 生产门）
**对齐**：`a2-a3-client-note.md` §0/§2–§6；`test-framework.md` 四层；control-checklist C1/C5/C10
**运行环境约束**：本沙箱无 Godot 二进制 → GDScript 不可编译/运行；唯一真实可跑门 = Node/TS 协议一致性测试
**硬约束**：本文件仅评审 + 文档产出，**不修改任何代码**；不 commit（VCS 由 orchestrator 所有）

---

## 0. 摘要 / 结论

| 项 | 结果 |
|---|---|
| 协议一致性（唯一实跑门） | **8/8 PASS**（独立重跑，见 §1） |
| GDScript 渲染 / 插值 / 预测 / 叠加层 | **仅可评审（review-only），不可在此沙箱运行** |
| 质量门判定 | **CONCERNS**（绿门 + 评审态代码放行，但 C2/C1/C5 为待跟踪非阻塞项） |
| 阻塞项 | **无** |

> 判定含义：协议契约绿、GDScript 作为「评审态代码」在合入前需由真实 Godot 运行清单（§3）证明；C2/C1/C5 作为非阻塞 CONCERN 跟踪。
> final release 签字（"好玩吗"人工验证门）必须由人在真实 Godot 环境完成——本 QA 不替代该签字。

---

## 1. 验证范围（VERIFIABLE vs REVIEW-ONLY）

### 1.1 可验证（已实跑 / 已对源码核对）
- **A. 协议一致性（实跑门，8/8）** — `client-protocol-conformance.mjs` 拉起真实 `dungeon-server`（in-process，`DEV_SKIP_AUTH`），真实 ws 客户端走完 鉴权→run start→input 上行→下行快照→input 被消费→重连→resume。
  实测输出（独立重跑，port 每次 ephemeral 变化，断言数固定 8）：

  ```
  === Epic A client protocol conformance (headless, real ws) ===

  server up on ephemeral port 62815 (DEV_SKIP_AUTH=true)

    [PASS] A1 session handshake + auth → room.create.ok (captured reconnectToken) — roomId=room_7064df30ddfa3d62 seatIndex=0 tokenLen=64 sessionReady=false
    [PASS] A2 game.start → game.start.ok (30Hz authority live) — runId=run_b9405a21340da583 tick=0
    [PASS] A3 input.cmd uplink accepted (no game.error) — ok
    [PASS] A4 downlink world.snap received (tick+entities) — tick=1 entities=31 localOwner=0
    [PASS] A5 control-plane room.snapshot broadcast received
    [PASS] A6 input consumed → local entity moved under authoritative sim — beforeX=1088 afterX=1106.666666666667
    [PASS] A7 session.reconnect → session.reconnect.ok (O-E7 resume accepted) — type=session.reconnect.ok snapshotTick=32 sessionReady=false
    [PASS] A8 resume → fresh world.snap on reconnected client (D8/O-E7) — tick=33 entities=31

  === SUMMARY: 8/8 assertions passed ===
  RESULT: PASS — client protocol conforms to dungeon-server contract.
  ```
  > 与工程 note 的差异仅是 `entities=31` vs `20`（本局刷怪更多），断言结构与数量一致，**可复现 8/8**，非回归。

- **B. 线协议字段契约（对源码核对，非新测试）** — `sim-core/src/world.ts:429-461` 序列化 `telegraph{shape,color,startTick,applyTick,radius}`、`shieldUntilTick`/`shieldReduction`/`tauntUntilTick`（均仅在 `>world.tick` 时下发，否则 `undefined` 被 JSON 丢弃键）、`activeSkill = a.activeSkill ?? undefined`。客户端（`EntityView.gd`）逐键读取并在缺失/过期时隐藏 → 线契约一致。
- **C. 枚举对齐（对源码核对）** — `sim-core/src/types.ts:176-181` `TelegraphShape={RING:0,AOE_FILL:1,CONE:2,LINE:3}`，与 `EntityView.gd` `enum TelegraphShape{RING,AOE_FILL,CONE,LINE}` 默认 0 起序**逐值相等**，无枚举错位 bug。
- **D. C1 常量对齐（对源码核对）** — `GameWorld.gd` `LOCAL_CLASS_MOVE_SPEED=[140,185,165,170]` + `TICK_RATE=30` 与 `sim-core/src/types.ts:33-36` `CLASS_BASE[].moveSpeed` 及 `world.ts:125` `moveSpeedPerTick=.../30` **当前逐值相等**（见 §5）。

### 1.2 不可验证（仅评审，需真实 Godot 运行）— 这是本门的硬边界
- 渲染正确性、插值顺滑度、预测正确性、"无残留叠加层"。
- 预警 grow+intensify 是否可读、是否贴在攻击者身上。
- shield ring / taunt marker / cast bar 是否"出现与消失严格对齐快照窗口"。
- 本地移动是否响应式、纠正是否"数帧内收敛而非 snap/橡皮筋"。
- 远端实体是否在 100ms 缓冲（INTERP_DELAY_MS=100）下顺滑滑步。
- 这些全部需要真实 Godot 4 editor / 浏览器导出运行（§3 清单），**本沙箱无法提供任何证据**。

> 关键提醒：`client-protocol-conformance.mjs` 只跑服务端契约，**完全不 import / 编译 / 运行任何 GDScript**（见其头部注释）。A4/A8 的 `world.snap` 断言只证明"线上下发了快照 + 客户端协议层能收到"，**不证明 GameWorld/EntityView 渲染正确**。

---

## 2. A2/A3 验收条件矩阵（协议层 vs 渲染层）

| 能力（来自 note §2/§3） | 协议层可验证 | 渲染层可验证 | 当前覆盖 |
|---|---|---|---|
| A4/A8 快照到达客户端（`world.snap` 路由，C2 修复） | ✅ A4/A8（6/8 中 2 项） | ❌ 需 Godot | 协议绿 / 渲染评审 |
| 100ms 插值缓冲 + 有界剪枝（`GameWorld.gd`） | ❌ | ❌ 需 Godot | 纯评审 |
| 本地预测 + 回正（指数平滑，不 snap） | ❌ | ❌ 需 Godot | 纯评审（C1 风险） |
| 预警 grow+intensify + 贴攻击者 | ❌ | ❌ 需 Godot | 纯评审（CONE/LINE 朝向见 §6） |
| shield/taunt/cast 叠加层按窗口出现消失 | ❌ | ❌ 需 Godot | 纯评审 |
| 重连同座还原（O-E7） | ✅ A7/A8 | ❌ 需 Godot | 协议绿 / 渲染评审（C5 风险） |

**结论**：每一项"用户可见行为"都停在评审态；唯一可跑证据是协议层 8/8。放行逻辑见 §7。

---

## 3. Godot 运行清单（合入前必须在真实 Godot 环境跑通）

> 来源：工程 note §5/§6。由 dev 在 Godot 4 editor 或浏览器导出环境执行；本 QA 不复现（无 Godot）。每条给 PASS 判据。

1. **【关键】导入客户端 → 连真实 `dungeon-server`（`DEV_SKIP_AUTH`）→ 实体渲染 + 滑步。**
   - 目的：端到端验证 C2 路由修复（`world.snap` 实际被 `world_snapshot_received` 消费并渲染）。若此步失败，世界视图全黑/不渲染——这是 A2/A3 的硬前置。
   - PASS：`_entity_views` 随快照 upsert，至少本地 + 若干远端实体可见并随 30Hz 快照平滑移动。

2. **预警可读性**：操控本地玩家靠近敌人前摇，确认预警**先放大（scale 0.35→1.0）后增强（fill/outline alpha ramp）**，且**贴在攻击者实体中心**。
   - PASS：危险区随时间可见扩张 + 变亮；hit 结算（applyTick）前可读；位置跟随攻击者。
   - 额外检查（见 §6）：**CONE（boss）/ LINE 指示是否朝攻击者实际朝向**——当前 `_show_telegraph` 未读取朝向，可能恒指 +x。

3. **协作技可视化 + 无残留叠加层**：
   - 释放 `SHIELD_ALLY` → 受护玩家出现青色 ring + 软填充；窗口过期后**消失**。
   - 释放 `TAUNT` → 施法者头顶出现黄色三角标记；窗口过期后**消失**。
   - 释放任意协作技 → 出现短暂 cast bar（600ms，id 变化时重触发）；`activeSkill` 持续存在但 cast bar 仅在触发后 600ms 显示。
   - **【重点】强制等待窗口过期**，确认所有叠加层在 `shieldUntilTick/tauntUntilTick ≤ render_tick`（或字段不再下发）后**不留残影**。REVIVE_BOOST（即时）应只闪 cast bar、无持久叠加层。
   - PASS：出现/消失严格对齐快照窗口，无 stale overlay。

4. **本地移动响应式 + 平滑纠正**：在有模拟延迟下驱动本地玩家，确认移动**即时响应（预测）**，且服务器纠正**数帧内指数收敛而非 snap/橡皮筋**。
   - PASS：手感跟手；纠偏无可见跳变。

5. **远端滑步**：观察其他玩家，确认在 30Hz 快照间以 100ms 缓冲**顺滑插值**（`INTERP_DELAY_MS=100`），无抖动。

6. **重连还原（O-E7）+ C5 专项**：强制断线 → 重连同座，确认渲染从冻结态无跳变恢复。
   - **C5 专项**：若重连落到**不同 seat**，确认本地 `class_ms` 不是旧座的残留速度（当前 `_local_class_ms` 仅首检推导一次，见 §5）。
   - **补充专项**：重连后确认没有因 `_unacked_inputs`/预测位置未重置导致的**虚假预测跳变**（见 §5 补充）。

---

## 4. C2 风险评估（数据面 stopgap 脆弱性）

### 4.1 根因
- 服务端 `connection-registry.serialize` 把原始 `WorldSnapshot` JSON（`Buffer.from(JSON…)`）下发，**无 `type` 字段**（R1 占位二进制）。
- 原 `ConnectionManager` 按 `msg.get("type")` 分发会**100% 丢弃所有快照** → 客户端不渲染。
- 工程 note 的客户端修复：在控制面 `type` 分支**之前**，按**形状**路由——任何无 `type` 且携带 `tick`(number) + `entities`(array) 的帧都转给 `world_snapshot_received`（`ConnectionManager.gd:_handle_message`）。

### 4.2 脆弱性（FLAG）
- **误路由类**：未来任何"无 `type` 且形状为 `{tick:number, entities:array}`"的新数据面消息都会被**误当作 `world.snap`** 路由（例如未来某诊断/回放帧复用该形状）。
- **测试盲区**：一致性测试的 `waitBinarySnap` 用的**正是同一形状启发式**（`typeof m.tick==="number" && Array.isArray(m.entities)`）。因此该门**无法捕获 C2 回归**——即使将来某帧形状巧合匹配，测试仍会 PASS。换言之，C2 的正确性目前**没有任何自动化护栏**。

### 4.3 建议（工程决策，非本 QA 范围）
- 服务端最终应**给数据面打标**：`{type:"world.snap", payload}` 包装，或二进制 framing tag（首字节=帧类型，对应 ADR-ENG-03 §A）。
- 客户端已**保留** `match "world.snap"` 分支（forward-compat），届时切回按 `type` 分发即可，彻底消除误路由类。
- **分类：CONCERN（非阻塞）**。当前行为正确且已验证；风险是未来的。登记为技术债，待服务端数据面定稿时关闭。

---

## 5. 覆盖缺口 C1 / C5（非阻塞 CONCERN，待跟踪）

### C1 — 客户端预测常量手工镜像自 sim-core（D9 golden 对齐风险）
- **当前已对齐（已核对源码）**：`GameWorld.gd` `LOCAL_CLASS_MOVE_SPEED=[140,185,165,170]` + `TICK_RATE=30` == `sim-core/src/types.ts:33-36` `CLASS_BASE[].moveSpeed`（tank140/ranger185/mage165/healer170）+ `world.ts:125` `moveSpeedPerTick=.../30`。逐值相等。
- **风险**：服务端任一处 `moveSpeed` 平衡改动 → 客户端预测**静默 desync（橡皮筋）**，直到客户端同步更新。这是 D9 单源对齐缺口。
- **隐藏假设**：`_local_class_ms` 用 `Connection.seat_index % LOCAL_CLASS_MOVE_SPEED.size()` 把 seat 映射为 class 索引，顺序假定 = `PLAYER_CLASSES=[tank,ranger,mage,healer]`（`types.ts:18`）。若服务端以**不同顺序**分配 class，本地速度即错。
- `CLIENT_INPUTS_PER_SERVER_TICK=2.0` 是启发式（≈60fps 输入 vs 30Hz 模拟），**非**精确重放服务端每 tick 的 latest-pending 应用（`note` §2 已自陈）。
- **建议**：`CLASS_BASE` / `TICK_RATE` / `PLAYER_CLASSES` 设为单源（共享 JSON 或 codegen 进客户端），使 D9 对齐自动化。

### C5 — 重连换座时 class 速度残留（次要）
- `_local_class_ms` 在首次本地实体检测时推导一次，`_local_entity_id` 也仅首检赋值、无重连重置钩子。
- 当前 `ConnectionManager._handle_message` 的 `session.reconnect.ok` 分支**不更新 `seat_index`**。若重连落到不同 seat，本地速度沿用旧座推导值 → 残留。
- **分类：低风险的 2–4 人流程**（通常同座恢复），工程 note 已标记。仍建议随 C1 单源化一并修。
- **补充发现（同簇，建议一并处理）**：重连时 `GameWorld` 未重置 `_unacked_inputs` / `_local_pred_pos` / `_local_render_pos` / `_local_entity_id`。新会话的 server `lastProcessedSeq` 未知（可能 -1/0），旧高 seq 的 `_unacked_inputs` 会 `seq > server_seq` 全保留并被重放到新服务器纠正之上 → **重连瞬间可能虚假预测跳变**。建议在 `Connection.reconnect_ok` 信号上重置预测/回正状态。

---

## 6. 其他评审发现（补充，非阻塞，待 Godot 运行评估）

- **A3 CONE/LINE 预警朝向**：`TelegraphState`（`types.ts:126-132`）**不含方向**；尽管 `EntityState.dir`（朝向 0-7，`types.ts:108`）在线上且 `apply_state` 可拿到，`_show_telegraph` 未读取朝向 → **CONE（boss）/ LINE 指示恒指 +x**。需 Godot 运行确认：服务端 CONE/LINE 攻击是否恒朝 +x；否则需新增 `dir/angle` 字段并在客户端旋转。
- **C3（设计确认）**：4 种 telegraph 形状（RING/AOE_FILL/CONE/LINE）是否为预期？brief 写的是"circle/rect"。确认（boss=CONE 的 tell 需要该设计决策）。
- **C4（设计确认）**：cast bar "触发即闪 600ms（id 变化时重触发）" 是否符合意图？若想要"当前持续增益"指示，需新快照字段。

---

## 7. 质量门判定

- **判定：CONCERNS**（绿门 + 评审态代码放行，C2/C1/C5 为待跟踪非阻塞项）。
- **阻塞项：无**。协议一致性 8/8（独立重跑确认）；线契约字段/枚举/C1 常量经源码核对一致。
- **CONCERNS（非阻塞，建议本 Phase 内跟踪）**：
  1. **C2**：数据面无 `type` 的形状路由脆弱 + 一致性测试同启发式导致**无回归护栏**。→ 服务端打标数据面后关闭。
  2. **C1**：预测常量手工镜像，服务端平衡改动会静默 desync；seat→class 顺序假设；`CLIENT_INPUTS_PER_SERVER_TICK` 启发式。→ 单源化。
  3. **C5**：重连换座 class 速度残留 + 重连未重置预测状态（可能虚假跳变）。→ 随 C1 一并修。
  4. **补充**：CONE/LINE 预警朝向（§6）；C3/C4 设计确认。
- **放行建议**：A2/A3 可**在 Godot 运行清单（§3）于真实 Godot 环境跑通后**放行合入；C2/C1/C5 作为非阻塞 CONCERN 跟踪，不阻塞 merge。最终"好玩吗"人工签字必须由人在 Godot 环境完成。

## 8. 后续衔接 TODO
- 服务端数据面定稿（R1 关闭）→ C2 打标 + 客户端切回 `type` 分发。
- C1 单源化（共享 JSON / codegen）→ 顺带关 C5 的 seat→class 与重连重置。
- Godot 运行清单（§3）落地为可重复 manual 证据，补入 `tests/smoke/a2-a3-smoke.md` 的执行记录。
- §6 补充项在 Godot 运行中确认 severity，必要时开新 Story。
