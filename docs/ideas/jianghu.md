# 江湖 · 武侠联机 ARPG（待重启设计稿）

> ⏸ **暂停于 2026-09-08**。原代码、服务端、nginx、systemd 全部拆除，仅保留这份设计稿 + `MEMORY.md` 里的核心玩法一行话。
> 重启时请先回答「暂停时解决不了的问题」这一节里的每一条，否则大概率重蹈覆辙。

## 一句话定位

一张可共闯的武侠大地图，纯合作、即开即玩的浏览器刷宝 ARPG：暗黑式词缀掉装 + 格挡反击节奏 + 随机秘境副本，服务端权威同步。

## 玩法核心

| 维度 | 决策 | 为什么这样做 |
|---|---|---|
| **基调** | 共闯合作（同图即队友，无 PvP） | 武侠 Roguelike 主线吃组队化学反应；PvP 会撕裂合作动机 |
| **节奏** | 网格点击 + 4 个技能（烈斩·剑气·震地·破军） / Q 喝药 / 8 向翻滚 | 类 Diablo 手感已验证对单手玩家友好；4 技能足够覆盖 build 横展空间 |
| **Build 来源** | 暗黑式词缀装备，每一件都是 build 选择 | 装备驱动比"升级驱动"更耐玩；词缀叠加让"毕业"几乎不存在 |
| **副玩法** | 大地图 + 随机秘境副本（服务端程序生成） | 刷宝阶段吃重复耐玩度；秘境是"未知即爽点"的爆点 |
| **玩家惩罚** | 死亡不掉永久装（低惩罚） | 高惩罚把玩家挡在门槛外；合作向需要「敢冲敢作死」 |
| **上手** | 浏览器点开就进，游客也能玩 | 0 安装、0 注册、共享链接邀人 |

## 技术决策

### 服务端

- Node + ws WebSocket，server-authoritative，**12 Hz tick 同步**（`TICK_RATE=12` ≈ 83.33ms / tick）
- 每 30 秒一次 server-side autosave character JSON（`CHARACTER_AUTOSAVE_MS=30000`，落 `/opt/lilnong-jianghu/data/jianghu-chars/`）
- Session Token TTL（`RECONNECT_TOKEN_TTL_MS=1800000`）+ disconnect grace（`DISCONNECT_GRACE_MS=30000`），允许短暂断线不丢角色
- Better Auth（api2 `:3002`）做账号托管，jianghu 服务消费 `/api/me` 验证；dev 模式 `DEV_SKIP_AUTH=true` + `?devUserId=`

### 客户端

- 单文件 HTML + Canvas 2D，**零构建**（`apps/web/public/games/jianghu/index.html`），浏览器直接打开能跑
- 客户端预测 + 服务端回正（server-authoritative 标配）
- 程序化剪影占位怪物 / 角色 → 未来用 AI 生图替换

### 前端到服务端的链路

```
玩家 → nginx 443 (/ws/jianghu) → systemd unit lilnong-jianghu :3011 → ws server
                                                                → (校验) Better Auth api2 :3002
```

## 当时解决不了的问题（重启必须回答）

1. **手感节奏与格子定位**：点击移动 + 网格的"踩点感"在 C2 单文件里只是粗版（详见 `WEB-FEEL` 注释区），多人走位 + BOSS 大范围技能还有「我到底站在哪一格」的不确定性。需要一次 build dedicated 的输入层抽象。
2. **怪物 / 任务素材**仍是程序化剪影。从原 art/ 素材审计看，AI 生图替换的 prompt 工程没完成——重启时先解决"程序化能撑到第几屏"再决定要不要全 AI 化。
3. **服务端程序生成秘境**还没实装（demos 阶段的"随机副本"是空架子）。WFC/rooms-and-corridors 任一都行，但需要先决 mapdata 表达（地图是 bson / json / 自定义二进制）。
4. **断线重连**实测不完整：grace 30s、token TTL 30min 是上限值，**没真在 30s 边界条件上跑过 playtest**。
5. **WS / 房间数 / 单房间玩家数**负载没压测过。重启第一周先 ab 到 100 CCU 看瓶颈在 sim 还是 IO。
6. **authoritative + 客户端预测**在 PvE 宽松场景里够用，但遇到"群控 + 击退 + 高延迟"组合会出现「我以为我闪了但被弹回原地」类体验。需要明确 trade-off / 默认关预测回退纯服务端。

## 重启 checklist

- [ ] 在 docs/ideas/ 里加新日期版本（不要覆盖本文件），把上面 6 条问题逐一答复
- [ ] 用 `packages/quality-gates`（harness）跑一次「需求→产物」受控生成的小型重做，避免再 OKR 全重来
- [ ] 服务端先做 sim-core 的纯 TS 单测（参考 `games/jianghu/sim-core/` 既有），再考虑接 ws
- [ ] AI 生图替换走新 skill（aura-asset-images / build-hybrid-game-assets），先小批量：3 怪 × 5 姿态
- [ ] 链路部署重新走一遍 `scripts/deploy-jianghu.sh` 的 npm ci + systemd + nginx（备份原 nginx conf）

## 关键文件路径（已删除，仅备忘）

- 原代码：`games/jianghu/`（apps/jianghu 服务端 + apps/web-client 客户端）
- 部署：`deploy/lilnong-jianghu.service` + `deploy/jianghu-nginx-snippet.conf`
- 脚本：`scripts/deploy-jianghu.sh`
- 远端：`/opt/lilnong-jianghu/`，systemd `lilnong-jianghu.service`，nginx `/ws/jianghu` → 3011
- 浏览器入口（已删）：`apps/web/public/games/jianghu/index.html`（C2 单文件 demo）

## 历史

- 2026-08 立项、demos 首版上线（playable demo on lilnong.top/demos/jianghu/）
- 2026-09-08 用户反馈"不太符合预期，整体设计有问题"，决定整体撤回后重新做（前后端源码、部署、systemd、nginx 全部已拆）
