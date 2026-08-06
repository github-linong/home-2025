# D8 烟雾测试清单（断线/重连接线最小可跑）

路径：tests/smoke/d8-smoke.md ｜ 作者：严守真（quality-lead-11）
前置：Node 22.22.2（本 review 验证）｜ apps/dungeon-server 依赖已装（ws）；sim-core 无外部依赖。
约束：本文件仅文档产出，不修改任何 src/test 文件（read-only review）。
说明：D8 闭合 E7 DEFER #1——把**真实** room-service 断线/重连（`markDisconnected`/`validateReconnect`）经依赖注入 `worldResolver(roomId)` 桥接到已落的权威 `World.setDisconnected`（系统⑦ 唯一托管入口）。本 smoke 验证接线在「真实 run」中生效：断线→World 托管（跳过 tick + 暂停计时 + 抓拍），重连→恢复推进无跳变，且另一玩家隔离。确定性由双 golden 守门（D8 未改 world 推进/移动/AI/前摇路径 → 哈希不变，无需重锁）。

**更正（对 quality-lead-5 旧 review）**：旧 review 误把「ws event → markDisconnected 胶水」标为 pre-playtest TODO。本 review 源码实读确认该胶水**已落地**——`gateway.ts:139`（ping 超时）与 `:167`（`ws close`）均调 `markDisconnected`；`protocol.ts:199`（session.reconnect）调 `validateReconnect`；二者经 `room-service.ts applyWorldDisconnect`（L85）→ `World.setDisconnected`（L93）驱动真实 World。**O-K6 在服务端层已真实端到端闭环**，非 TODO。本 smoke 步骤 6 的「真实 run 接线」即验证这条已落地的路径。

**本 review 实跑观测值**：dungeon-server **28/28 #fail 0**；sim-core **51/51 #fail 0**；playtest **7/7 EXIT 0**，GOLDEN_PLAYTEST_HASH=`889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`（字节相等、未变）。

---

## 步骤 1 — dungeon-server 全量（含 D8 接线，28/28）
```bash
cd apps/dungeon-server
node --experimental-strip-types --test tests/*.test.ts
# 期望：# tests 28 / # pass 28 / # fail 0
# 其中 d8-disconnect-wiring.test.ts = 1 例（端到端 markDisconnected→setDisconnected(0,true) / validateReconnect→setDisconnected(0,false) / 玩家 B 隔离）
```
> 本 review 实测：末尾 `# tests 28 / # pass 28 / # fail 0` ✅

## 步骤 2 — sim-core 全量（51/51；D8 不新增 sim-core 测试）
```bash
cd packages/sim-core
node --experimental-strip-types --test tests/unit/*.test.ts tests/golden/*.test.ts
# 期望：# tests 51 / # pass 51 / # fail 0
# 注：task brief 引用的 "tests/unit/*.test.ts" 仅命中 43 例（green，subset）；51 是 full 套件（unit 43 + golden 8）。
```
> 本 review 实测：末尾 `# tests 51 / # pass 51 / # fail 0` ✅

## 步骤 3 — playtest 核心循环验证门（D8 不影响固定序列 → golden 不变）
```bash
cd /Users/lnmacmini/Projects/personal-site/games/dungeon-online
node scripts/playtest-core-loop.mjs
# 期望：检查项 7 / 通过 7 / 失败 0 / 确定性 hash=889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14 / EXIT 0
```
> 本 review 实测：检查项 7 通过 7 失败 0；hash=`889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`；byte-equal=true；EXITCODE=0 ✅

## 步骤 4 — 纪律 B 静态 grep（room-service 仅调 world.setDisconnected）
```bash
cd apps/dungeon-server/src
# 期望：仅 L93 命中 world.setDisconnected；seat.status 引用为房间级 SeatStatus；零 sim-core 实体变异。
grep -nE 'world\.' room-service.ts                 # 仅 L23(类型import) + L83(注释) + L93(setDisconnected) 命中
grep -nE 'setDisconnected' room-service.ts         # 仅 L83(注释) + L93(真实调用) 命中（L75 setWorldResolver / L85/L266/L278 applyWorldDisconnect 为不同函数名，不含子串 setDisconnected）
grep -nE '\b(hp|status)\s*=' room-service.ts        # 仅为 seat.status（房间级 SeatStatus），无 world actor 直改
grep -nE 'rescueTicks|downedTicks|EntityStatus' room-service.ts  # 0 匹配（exit 1=无命中）：未触碰 sim-core 计时/位掩码
```
> 本 review 实测：B1→3 命中（L23/L83/L93）；B2→2 命中（L83/L93）；B3→全为 seat.status 房间级；B4→0 匹配 ✅

## 步骤 5 — resolver 桥接自检（server.ts L35 真实接线等价复刻）
```bash
cd apps/dungeon-server
node --experimental-strip-types --input-type=module -e "
import { createRunManager } from './src/run-manager.ts';
import { createRoom, lockSeat, confirmSeat, markDisconnected, validateReconnect, setWorldResolver } from './src/room-service.ts';
import { PLAYER_CLASSES } from '../../packages/sim-core/src/types.ts';
const runManager = createRunManager();
const room = createRoom('A','A');
['A','B'].forEach((u,i)=>{ lockSeat(room,u,i); confirmSeat(room,u,u,i); });
setWorldResolver((roomId) => runManager.getWorld(roomId));   // 镜像 server.ts L35
runManager.startRun(room.roomId, { runId:'d8-smoke', seed:'D8-SEED', biomeId:0, players:[
  { seatId:0, userId:'A', classId: PLAYER_CLASSES[0] },
  { seatId:1, userId:'B', classId: PLAYER_CLASSES[1 % PLAYER_CLASSES.length] },
]});
room.runId = 'd8-smoke';
const world = runManager.getWorld(room.roomId);
const calls = [];
const orig = world.setDisconnected.bind(world);
world.setDisconnected = (id,dis)=>{ calls.push({id,dis}); orig(id,dis); };
markDisconnected(room, 'A');
if(!calls.some(c=>c.id===0&&c.dis===true)) throw new Error('D8: markDisconnected 未驱动 world.setDisconnected(0,true)');
if(world.actors().find(a=>a.ownerId===1).disconnected !== false) throw new Error('D8: 玩家 B 被误伤');
const token = room.seats[0].reconnectToken;
validateReconnect(room, 'A', 0, token, room.runId);
if(!calls.some(c=>c.id===0&&c.dis===false)) throw new Error('D8: validateReconnect 未驱动 world.setDisconnected(0,false)');
setWorldResolver(null);
console.log('D8 resolver bridge OK (mark->(0,true), reconnect->(0,false), B isolated)');
"
```
> 本 review 实测：打印 `D8 resolver bridge OK (mark->(0,true), reconnect->(0,false), B isolated)` ✅

## 步骤 6 — 真实 run 接线确认（联机 playtest 前必跑；验证已落地的 ws 黏合）
> 目标：在「真实 run」里确认 socket 断线/重连驱动权威 World 托管，且另一玩家隔离。此路径**已落地**（gateway.ts L139/L167 + protocol.ts L199），本步骤确认其运行期行为。
```bash
# (a) 起服务器（DEMO_RUN=1 自动起一局 1 dummy 玩家，便于观察 30Hz 循环 + 广播）
cd apps/dungeon-server
DEMO_RUN=1 node --experimental-strip-types src/server.ts
#   观察 stdout：listening on http://127.0.0.1:<port> (ws /ws/dungeon) RESIDENT=room_resident_public
#
# (b) 健康检查（确认 RESIDENT 房 + run 在跑）
curl -s http://127.0.0.1:<port>/healthz | head -c 400
#   期望：ok=true，且 residentRoom.stateVersion/roomState 合理
#
# (c) 模拟断线（真实 ws 黏合的等价触发）：ping 超时（gateway.ts L139）/ ws close（L167）均会调 markDisconnected。
#     也可用 /internal/kick（管理令牌，见 config.internalAdminToken）直接触发断线 branch：
curl -s -X POST http://127.0.0.1:<port>/internal/kick \
  -H "x-admin-token: <internalAdminToken>" \
  -d '{"userId":"<targetUserId>","reason":"admin_kick"}'
#   期望：{"ok":true}
#   观察：房间 presence 变化广播；该 seat.status → "disconnected"；
#        权威 World 内对应 actor.disconnected === true（tick 跳过 + 计时暂停 + PersonalState 抓拍）。
#
# (d) 模拟重连：客户端持 reconnectToken 走 validateReconnect 路径（protocol.ts session.reconnect / L199）
#   期望：actor.disconnected === false，计时从剩余窗口续算，无跳变；另一玩家不受影响。
```
> 注：真实 socket 生命周期由 gateway（`connection-registry` / `gateway.ts`）在连接关闭时调 `markDisconnected`、在 reconnection 时调 `validateReconnect`。本 manual 步骤用 `/internal/kick` 等价触发断线 branch；重连需客户端实现（Godot S4.2/S4.4，属 DEFER）。**胶水本身已落地，非 TODO。**

## 步骤 7（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # 本仓未装 typescript，devDep 装好后接入 CI；当前已配 script + strict tsconfig（E2 遗留，与 D8 无关）
```

---

## 烟雾 PASS 判据
- 步骤1：dungeon-server **# tests 28 / # pass 28 / # fail 0**（含 d8-disconnect-wiring.test.ts 端到端绿）。
- 步骤2：sim-core **# tests 51 / # pass 51 / # fail 0**（full 套件；unit-only 43 为 subset 亦绿）。
- 步骤3：打印 `检查项：7 通过：7 失败：0` 且 `golden match=true` 且 EXITCODE=0；hash=`889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`。
- 步骤4：四条 grep 符合预期——仅 L93 `world.setDisconnected` 命中；`seat.status` 为房间级 `SeatStatus`；零 `hp=/EntityStatus/rescueTicks/downedTicks` sim-core 直改（纪律 B 绿）。
- 步骤5：打印 `D8 resolver bridge OK (mark->(0,true), reconnect->(0,false), B isolated)`。
- 步骤6：手动 run 中 `markDisconnected`/`validateReconnect` 经 `/internal/kick` 等价触发，`actor.disconnected` 正确翻转且另一玩家隔离。
- **合入门 smoke PASS 判据**：步骤1/2/3/4/5 全绿（步骤6 为联机 playtest 前人工确认项，步骤7 为 C-A 可选）。

## 明确不在此 smoke 闭环的项（属 DEFER / open follow-up，见 qa-plan-d8.md §4）
- **player-left epic（CONCERN a，open follow-up）**：`disconnectGraceMs` 超时 / `clearSeat` / `leaveRoom` 后，World 内 actor 仍 `disconnected`（不反向 `setDisconnected(false)`），最终处置归独立 epic。非阻塞（D8 范围 = 断线/重连钩子，玩家离开清理越界）。
- Godot 客户端重连插值（O-E7，CONCERN b）。
- 无自动化 ws 级 E2E，仅 d8 单元测试 + 本 manual 步骤 6（CONCERN c）。
- C-A 类型门（CONCERN 6）、R1 二进制 diff（CONCERN 7）、阈值 P5 调优（CONCERN 8）。
- 建议后续补的集成回归：全链路「机制+接线」断线冻结/重连续算（CONCERN 4）、resolver-null 防御断言（CONCERN 5）。
