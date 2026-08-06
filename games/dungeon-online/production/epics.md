# 《余烬小队》MVP Epic / Story 拆分 · Phase 4 预制作

**路径**：`games/dungeon-online/production/epics.md`
**作者**：程基岩（engineering-lead）
**状态**：草稿经用户批准落盘（Sprint 1）
**依据**：systems-index（13 系统 + 依赖 DAG）、六份 GDD、ADR-NET-01/ENG-02/ENG-03、control-checklist（C1–C11）。

## 0. 拆分原则
- Epic 按「系统」为主、核心循环按「垂直切片」优先。
- 每个 Story 含用户故事 + 可测验收标准 + 依赖 + Phase 归属（P5 制作 / 打磨）。架构/ADR 属 P3（已落盘），本表为实现阶段拆分。
- control-checklist C1–C11 逐条归属（§3 矩阵）。

## 1. 优先级：核心循环垂直切片（先验证「好玩吗」）
切片 = **① 联机房间 + run-runtime 骨架(30Hz) + ④ 输入预测 + ⑦ 战斗 + ⑤ 地牢生成 + ⑧ 敌人AI + ⑪ 救援**。端到端贯通「探→战→拾→商→下→Boss→结算」雏形，验证 P1 协同 / P2 新谜题 / P3 可读 / P4 重连 的最小可玩闭环。其余系统围绕切片补齐。

## 2. Epic 列表（13 项，对应 13 系统 + run-runtime 基座）

### E1 — 联机房间 + run-runtime 骨架（① 联机与房间）  [P5 制作 · 切片基座]
- S1.1 房间服务：好友房创建/6位房间码/邀请token/co-host 管理权迁移（复用 poker lobby-service）。
- S1.2 传输网关：ws gateway + verifyWithApi2 鉴权 + connection-registry 二进制 diff 重载（控制面 JSON / 数据面 Buffer）。【C5】
- S1.3 30Hz run-runtime 主循环：tick 调度 + 输入队列 dequeue + 权威快照容器 + 广播。【C6】
- S1.4 配置覆盖：pongTimeoutMs=5000 / pingIntervalMs=1000（覆盖默认 45s/15s）。【C2】
- S1.5 RESIDENT 公共房：启动单例 + sweepIdleEmptyRooms 排除 + 多实例 sticky 路由。【C4】
- S1.6 重连握手：reconnectToken 校验 + 全量 WorldSnapshot 拉取 + 插值重同步（占位归位，计时还原见 E7）。【C10 部分】
- S1.7 TICK_RATE=30Hz 常量锁定 + GDD 三处初值改引用协调（design-strategist 落盘）。【C1】
依赖：E2（状态模型）。Phase：P5。

### E2 — 基座数据模型（② 角色与职业 + ③ 敌人与资源数据定义）  [P5 制作 · Layer0]
- S2.1 统一状态/属性模型：HP/max_hp/status bitmask/faction 色/downed 标志/职业图标/移速（供 ④⑥⑦⑧⑪⑬ 共用）。
- S2.2 敌人原型表：杂兵/精英/Boss 属性 + telegraph 参数（引用，非运行时）。
- S2.3 资源原型表：药品/弹药/增益类型与效果。
- S2.4 确定性 RNG 接口（splitmix64/Xoshiro）：seed→布局流，供 E3。【C6 纪律A 数据边界】
依赖：无。Phase：P5。

### E3 — 地牢生成（⑤）  [P5 制作 · Layer1 · 切片]
- S3.1 确定性种子生成：run_seed + biome_id → 房间图 + SpawnPoint[] + 资源点 + 楼层序列。
- S3.2 SpawnPoint[] 输出契约：只读实例（pos/enemy_type_id/wave/count），纪律 A（⑧只读不调）。
- S3.3 布局快照序列化：LayoutSnapshot（JSON 低频）。
- S3.4 确定性 golden-test：同 seed→同布局向量（TS 权威 + GDScript 端口对齐）。【C7】
依赖：E2(③)。Phase：P5。

### E4 — 输入与客户端预测（④）  [P5 制作 · Layer1 · 切片]
- S4.1 输入采样 + InputCmd schema（seq/tick/action/dir）+ 每 tick 上报。
- S4.2 本地预测：自身移动/普攻表现（不等待服务器）。
- S4.3 reconciliation 回正：保留 RTT/2+2 tick 未确认指令，收 diff 后重演。
- S4.4 插值平滑：远程玩家/敌人 100ms 缓冲。
- S4.5 延迟指示数据暴露：ping/重连状态给 HUD。
依赖：E1(①)。Phase：P5。【C6 纪律B：consumer 不改 diff 格式】

### E5 — 战斗（⑦）  [P5 制作 · Layer2 · 切片 · producer]
- S5.1 统一结算核心：伤害/状态逐 tick 裁定（玩家+敌人共用）。
- S5.2 移动/碰撞：碰撞层只读约束。
- S5.3 普攻/闪避 i-frame/技能结算。
- S5.4 伤害请求协议：校验 i-frame/存活/范围命中（权威位置）。
- S5.5 倒地触发：HP≤0 → DOWNED 事件（交 E7）。
- S5.6 命中权威判定点：application_tick 服务器裁定。
- S5.7 反作弊基线：服务器权威校验 + InputCmd seq 防重放。【C11】
- S5.8 telegraph 调度落地（与 E6 协同，application_tick 由 ⑦ 结算）。【C8 部分】
依赖：E2(②) + E4(④) + E1(①)。Phase：P5。

### E6 — 敌人与 AI（⑧）  [P5 制作 · Layer2 · 切片]
- S6.1 刷怪：只读 SpawnPoint[] 实例（纪律 A）。
- S6.2 AI 行为：寻路/攻击选择/编队。
- S6.3 telegraph 生成：静态可读 shape+color+sound。
- S6.4 伤害请求提交：application_tick = T0 + ceil(前摇/TICK_MS)。
- S6.5 MIN_TELEGRAPH_TICKS=18 常量 + 前摇≥0.6s 写入。【C8】
依赖：E3(⑤) + E5(⑦) + E2(②)。Phase：P5。

### E7 — 救援与倒地（⑪）  [P5 制作 · Layer2 · 切片 · P1+P4]
- S7.1 倒地接管：⑦ HP≤0 → DOWNED，本系统接管。
- S7.2 自救/救援读条：solo 自救降级分支。
- S7.3 呼救广播（经 E10 信号）。
- S7.4 DOWNED 免疫补刀致死。
- S7.5 超时 → OUT（本局观战，下局重置）。
- S7.6 托管快照：断线抓拍 PersonalState 单次持有 + ⑦跳过该玩家 tick + 本系统暂停 DOWNED/救援计时（三者同发）。【C3 · P4 保底】
- S7.7 重连归位还原：当前 room 态 + 保留 PersonalState 分离还原（含剩余窗口，防跳变）。【C10 部分】
依赖：E5(⑦) + E2(②) + E1(①) + E10(⑩)。Phase：P5。

### E8 — 协作技（⑨）  [P5 制作 · Layer2 · P1 验证门槛最高 W1]
- S8.1 触发条件/连携判定（依赖战斗+角色+联机）。
- S8.2 协同增益结算（入战斗系统 E5）。
- S8.3 4 职业协作技实现（坦护盾墙/医者救援链/控场合围/游侠）。
依赖：E5(⑦) + E2(②) + E1(①)。Phase：P5。

### E9 — 资源与掉落（⑥）  [P5 制作 · Layer1]
- S9.1 资源节点固定放置（依赖 E3 布局）。
- S9.2 拾取判定。
- S9.3 库存与分配（实时谈判）。
- S9.4 结算清点。
依赖：E2(②) + E3(⑤)。Phase：P5。

### E10 — 信号与沟通（⑩）  [P5 制作 · Layer2 · P1]
- S10.1 ping/标记/表情/急救呼救。
- S10.2 世界内 + HUD 呈现。
- S10.3 救援呼救接口（供 E7）。
依赖：E1(①) + E4(④)。Phase：P5。

### E11 — 进度与结算（⑫）  [P5 制作 · Layer3]
- S11.1 楼层推进（依赖 E3）。
- S11.2 Boss 触发（依赖 E5）。
- S11.3 通关/团灭判定。
- S11.4 结算（依赖 E5+⑨+①）。
- S11.5 RESIDENT 进度边界处理（W2：公共房不参与正式进度）。
依赖：E3(⑤) + E5(⑦) + E1(①) + E9(⑥)。Phase：P5。

### E12 — HUD 与 UX（⑬）  [P5 制作 + 打磨]
- S12.1 队伍面板（4 头像+血条+状态，阵营色）。
- S12.2 技能/快捷栏。
- S12.3 连接/延迟指示（ping/重连，图标+文字三重）。
- S12.4 倒地/救援环形进度。
- S12.5 地图 ping + Boss 血条。
- S12.6 战争迷雾并集（Light2D/可见性多边形，引擎接口）。
- S12.7 可访问性底线（Lean Standard：色盲三重编码/按键重映射/减弱动效保留静态预警）。
- S12.8 可访问性 Comprehensive 升级（预留钩子）。【打磨】
依赖：E1+E2+E5+E6+E7+E9+E10（聚合只读）。Phase：P5（S12.1–12.7）/ 打磨（S12.8）。

### E13 — 跨职能文档回填（W3 / 一致性）  [P5 制作前 · design-strategist 负责]
- S13.1 C9：D3 不等式值（250/100/0.6s）回填进 ④§7 / ⑦§7 / ⑧§4 三处同步。
- S13.2 C1 落盘：①/④/⑦ 三份 GDD TICK_RATE 初值改为引用 ADR-NET-01。
归属：design-strategist（非工程 Epic，列为门禁前置）。Phase：P5 制作前。

## 3. control-checklist → Epic/Story 归属矩阵
| 门禁 | 内容 | 归属 Epic | 归属 Story |
|---|---|---|---|
| C1 | TICK_RATE 30Hz + GDD 引用 | E1 | S1.7 (+E13 S13.2) |
| C2 | 心跳 5s/1s 覆盖 | E1 | S1.4 |
| C3 | D8 托管三者同发 | E7 | S7.6 |
| C4 | D11 RESIDENT | E1 | S1.5 |
| C5 | 二进制 diff 通道 + 压测 | E1 | S1.2 |
| C6 | 纪律 A/B 代码层 | E1(run-runtime) | S1.3 / E2 S2.4 / E4 S4.5 |
| C7 | D9 golden-test | E3 | S3.4 |
| C8 | D12 MIN_TELEGRAPH_TICKS | E6(+E5) | S6.5 / S5.8 |
| C9 | D3 回填 | E13 | S13.1（design-strategist） |
| C10 | 重连无跳变 | E1 + E7 | S1.6 / S7.7 |
| C11 | 反作弊基线 | E5 | S5.7 |

## 4. 实现顺序建议（依赖驱动）
E2 → E1 → E4 → E3 → E5 → E6 → E7（核心切片闭环）
→ E9 → E10 → E8 → E11 → E12（补齐）
↔ E13（C9/C1 文档回填，与 E1/E4/E5/E6 并行前置）
