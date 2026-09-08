# 余烬小队 · 地牢联机 Roguelike（待重启设计稿）

> ⏸ **暂停于 2026-09-08**。原代码、服务端、nginx、systemd 全部拆除，仅保留这份设计稿 + `MEMORY.md` 里的核心玩法一行话。
> 重启时请先回答「暂停时解决不了的问题」这一节里的每一条。

## 一句话定位

2–4 人小队合作的像素风实时动作 Roguelike 地牢：随机生成、轻量 Build 构筑、权威服务器同步、断线即重连。

## 玩法核心

| 维度 | 决策 | 为什么这样做 |
|---|---|---|
| **人数** | 2–4 人小队 | 单人玩嫌压力小；5+ 人合作技复杂度爆掉。可手动 1 人开局拉 AI 补位（`MIN_PLAYERS=1`） |
| **职业** | 坦 / 射 / 法 / 医 四职业 | 既覆盖护盾 / 输出 / 救援三个角色，又有"你是医那我换坦"的动态组合 |
| **协作技** | 护盾 / 急救 / 嘲讽 / 标记 / 弹幕 | 主动技 + 即时打断（"你压血线了我可以贴"）比被动 buff 更聚合作感 |
| **节奏** | 4 波杂兵 + 1 BOSS，每局 15–25 分钟 | 单局吃满一次"组局→决战→散"流程，下班一局不撑不饱 |
| **生成** | 程序化房间 + 走廊（服务端权威） | 不让玩家背板；保证服务端的 read-only 真理 |
| **救援机制** | 队友救 vs 放弃是有意思的抉择 | "救不救队友"是反复出现的资源博弈；不会演变成"我救你所以你不踩雷" |
| **惩罚** | 队友死了能救回（被救起但虚弱），物品 loss +1 但不丢角色 | 高惩罚会赶走低玩；合作向要敢作 |
| **断线** | 角色由服务器保留 30min（`DISCONNECT_GRACE_MS=30000` + `RECONNECT_TOKEN_TTL_MS=1800000`） | 不让公交 / wifi 抽风的人被踢出队 |

## 技术决策

### 服务端

- Node + ws（`apps/dungeon-server/`，302 端口是 `3010`），server-authoritative
- 房间为单位：`ROOM_CODE_LENGTH=6`、`MAX_SEATS=4`、`MIN_PLAYERS=1`，空房间 30min 自动回收（`ROOM_IDLE_TTL_MS=1800000`）
- 服务端只计算伤害与状态机；客户端预测 + 回正
- `INTERNAL_ADMIN_TOKEN` 控制 /admin 强制结束、清缓存等
- dev 模式 `DEV_SKIP_AUTH=true` + `?devUserId=`，线上强制 false

### 客户端

- 浏览器 Canvas 2D，纯像素风
- sim-core 是纯 TS（与 ws 解耦，便于单测），原 `games/dungeon-online/packages/sim-core/src/` 包含 `world.ts` / `combat.ts` / `enemy-ai.ts` / `skills.ts` / `dungeon-gen.ts` / `rng.ts` / `rescue.ts` / `types.ts` / `input.ts`
- 单局存档 = 房间实例，状态由服务端保留

### 前端到服务端的链路

```
玩家 → nginx 443 (/ws/dungeon) → systemd unit lilnong-dungeon :3010 → ws server → 服务端权威 → Better Auth api2 :3002
```

## 当时解决不了的问题（重启必须回答）

1. **职业平衡**只在纸面跑过，**没真打 playtest**。尤其是「医 + 坦 + 法 + 射 4 人组」与「3 人缺医」两套搭配的数据差，没量化。
2. **room simulator** 缺压测：4 CCU × N 房间的 NPC AI tick 成本，没 ab 过。重启第一周先 cap 到 50 CCU 观察。
3. **dungeon-gen.ts 程序化** 只在最早期一版（rooms + corridors），BOSS 房 / 商店房没有差异化。重做需要明确 "places enum"。
4. **rescue 机制** 写过 stub，**救不救 ROI** 没算：救起虚弱队友 30 秒 vs 自跑 10 秒，差距太小，结果就是默认不救。需要先定数值。
5. **本地单机模拟器** `local-sim.js`（也部署在 `apps/web/public/games/dungeon/`）和正式联机走两套路径——重启需要先统一 abstract sim 与 transport 的边界，避免再分叉。
6. **没做单元 / 集成测试覆盖率**：sim-core 原本应该 90%+，实际缺口很大，导致每次改技能要靠手工玩一局。
7. **协作技教学** 没做——第一局遇到医的"急救"，新玩家不会主动按 → UI 上需要「在队友血线 <30% 时浮提示」。

## 重启 checklist

- [ ] 在 docs/ideas/ 里加新日期版本（不要覆盖本文件），把上面 7 条问题逐一答复
- [ ] sim-core 走纯 TS + 单测 90%+，再考虑接 ws（参考 `packages/quality-gates` 受控生成）
- [ ] 数值靠 spreadsheet（seed 房宽 / BOSS HP / 技能 CD）跑 repl 而不是看代码
- [ ] 教学关做"3-2-1 倒计时 → 释放急救"的强行引导
- [ ] local-sim 与联机统一一份 sim-core 入口，避免再分叉
- [ ] 链路部署重新走 `scripts/deploy-dungeon.sh` 的 rsync + npm ci + systemd + nginx

## 关键文件路径（已删除，仅备忘）

- 原代码：`games/dungeon-online/`（apps/dungeon-server 服务端 + apps/web-client 客户端 + packages/sim-core 纯 TS sim）
- 部署：`deploy/lilnong-dungeon.service` + `deploy/dungeon-nginx-snippet.conf`
- 脚本：`scripts/deploy-dungeon.sh`
- 同步：`scripts/sync-games.mjs`
- 远端：`/opt/lilnong-dungeon/`，systemd `lilnong-dungeon.service`，nginx `/ws/dungeon` → 3010
- 浏览器入口（已删）：`apps/web/public/games/dungeon/index.html`（Canvas 像素 + `local-sim.js`）

## 历史

- 2026-08 立项、demos 首版上线（playable demo on lilnong.top/demos/dungeon-online/）
- 2026-09-08 用户反馈"不太符合预期，整体设计有问题"，决定整体撤回后重新做（前后端源码、部署、systemd、nginx 全部已拆）
