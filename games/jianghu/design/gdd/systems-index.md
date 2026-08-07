# 系统设计索引 · systems-index

> 作者：design-strategist　|　版本：v0.1（Phase-2）　|　关联：concept.md、design/gdd/*.md
> 本文件给出 7 个系统的**依赖排序（DAG）**、**跨 GDD 一致性评审**、**设计理论红线复核**。

---

## 1. 系统清单
| 编号 | 系统 | GDD 文件 |
|------|------|----------|
| SYS-07 | 认证 | auth.md |
| SYS-06 | 持久化 | persistence.md |
| SYS-01 | 移动 | movement.md |
| SYS-02 | 战斗 | combat.md |
| SYS-03 | 刷怪 | spawning.md |
| SYS-04 | 掉装 | loot.md |
| SYS-05 | 随机地牢 | dungeon.md |

## 2. 依赖排序（DAG）
```
auth(SYS-07)
  └─> persistence(SYS-06)            ; 身份决定加载/保存路径
        └─> movement(SYS-01)         ; 身份+位置落库
              ├─> combat(SYS-02)     ; 依赖 移动(站位)+持久化(属性)+掉装(词缀)+刷怪(目标)
              ├─> spawning(SYS-03)   ; 依赖 地图+掉装(掉落)+战斗(目标)+移动(分区)
              └─> loot(SYS-04)       ; 依赖 刷怪(来源)+持久化(入库)+战斗(击杀)
                    └─> dungeon(SYS-05)  ; 聚合 刷怪+掉装+移动+战斗，副本临时态归持久化
```
**建议实现顺序**：`auth → persistence → movement → {combat + spawning + loot 联调} → dungeon`。
> 说明：combat / spawning / loot 三者形成"击杀事件→掉落→数值反哺战斗"的紧耦合环，须联调而非串行；dungeon 因聚合前四者，置于最后。

---

## 3. 跨 GDD 一致性评审
检查各 GDD 与 concept.md 之间**共享常量/实体**是否矛盾：

| 共享项 | 出处（一致） | 结论 |
|--------|--------------|------|
| TILE=48px 水墨像素 | movement§③ / concept§6·§7.1·决策⑤ | ✅ 一致 |
| TICK_RATE=12 | movement§③ / concept§7.1 | ✅ 一致 |
| 属性三系 STR/DEX/VIT（去"内"） | combat§③ / loot§③ / persistence§③ / concept§2.1·§8.3⑦ | ✅ 一致 |
| XP_req(L)=50·L^1.5 | persistence§③·§⑥ / concept§8.3③ | ✅ 一致 |
| 掉率 普通0.30/精英1.0/BOSS1.0(加权) | loot§⑥ / concept§7.4·§8.3⑥ | ✅ 一致 |
| affixCount 白0-1/蓝2/金3-4/暗金4+1 | loot§⑥ / concept§7.4 | ✅ 一致 |
| 精英×3 / BOSS×10 | spawning§⑥ / combat§⑥ / concept§7.3·§7.4 | ✅ 一致 |
| 格挡 ParryReduction=0.6, 窗口 **250ms**（`PARRY_TICKS=3`，闭区间 `windowEndTick=tick+PARRY_TICKS-1`） | combat§⑥ / ADR-JH-ENG-01 §2（已决）；concept §7.2 保留 200ms 设计意图 | ✅ 一致（已决量化：200ms→250ms，ADR 为权威；O3 off-by-one 已修） |
| 技能CD 3–8s | combat§⑥ / concept§7.2·决策C | ✅ 一致 |
| BOSS 三档 + 置于最深层 | dungeon§②·§⑥ / spawning§② / loot§② / combat§② / concept§8.3⑥ | ✅ 一致 |
| 纯合作无 PvP | combat§①·§⑤ / concept决策A·P1 | ✅ 一致 |
| 死亡不掉永久装 | persistence§② / combat§⑤ / concept决策④ | ✅ 一致 |
| 游客不入库 | persistence§⑤ / loot§⑤ / auth§⑤ / concept§8.2 | ✅ 一致 |
| 入口 seed=hash(serverTick+entranceId+partyTag) | dungeon§②·§③ / concept§7.5 | ✅ 一致 |
| 背包上限 60 | loot§⑥ / persistence§③ | ✅ 一致 |
| 安全区暖色反转 / DANGER8% / 裂隙异象漩涡 | concept§6 / movement§② / spawning§② / dungeon§② | ✅ 一致 |

**跨 GDD 一致性结论：PASS**（无数值/命名矛盾；下方 4 项开放问题已全部落定为「已决·主理人推荐」，可在 Phase-3 由程基岩架构验证时微调）。

**已决项（RESOLVED · 主理人推荐，Phase-3 程基岩可微调）**：
1. **客户端预测 + 服务端回滚（R2）**：采用「移动输入预测 + 100ms 插值；格挡/技能服务端校验时间窗，不做全量回滚」（movement§⑧ / combat§⑧）。
2. **游客→登录迁移**：明确**不合并**（丢弃游客进度）（persistence§⑧ / auth§⑧ / persistence§⑤）。
3. **背包满策略**：溢出落脚下地面（TTL 自动消失），无邮件（loot§⑤ / persistence§⑤）。
4. **单角色多端**：后连接顶替（last-wins）（auth§⑤ / persistence§⑧）。
5. **格挡窗口量化（R2a）**：`PARRY_WINDOW=200ms` → `PARRY_TICKS=3`（250ms），窗口为闭区间 `windowEndTick = tick + PARRY_TICKS - 1`（O3 off-by-one 已修）（combat§⑥ / ADR-JH-ENG-01 §2）。
6. **BOSS 阶段（MVP）**：2 阶段 @50% hp（`BOSS_PHASE_THRESHOLD=0.5`，playtest 实证）；3 阶段（66%/33%）+ 特殊技归 Phase-2（combat§②·§⑥ / dungeon§⑥）。
7. **精英率**：15%（保持实现；concept §7.3 早期草图 5% 作废）（spawning§⑥ / dungeonGen.ts）。

---

## 4. 设计理论红线复核（对照 5 支柱 + P1/P5 护栏）
| 红线 | 在 GDD 中的落点 | 评估 |
|------|----------------|------|
| **主导策略** | combat§⑧ 监控格挡无敌帧/技能 CD；BOSS 单技能碾压由 spawning/combat/loot 联调防 | ✅ 已布防，无锁定最优解 |
| **经济失衡** | loot§⑧ 记录无 sink，MVP 宽松可接受，Phase-2 加打造/交易税 | ✅ 有意识延后，已标注 |
| **认知过载** | loot§② 小词缀池（3 属性+7 词缀）、白装无词缀、tooltip 分层 | ✅ 护 P5（即开即玩） |
| **支柱漂移** | 全 GDD 无 PvP（护 P1）；死亡不掉装+游客可玩（护 P5） | ✅ 无漂移 |
| **P1 共闯** | combat/spawning 仇恨共享支撑事实 co-op；决策② 无组队 UI 但开放 | ✅ 落地 |
| **P5 即开即玩** | auth§⑥ 游客一键进入；persistence 死亡低惩罚 | ✅ 落地 |

**红线复核结论：PASS**（四大红线均有对应监控/缓解；P1/P5 护栏在设计中显式保住）。

---

## 5. 总体结论
- **依赖排序**：清晰 DAG，实现顺序建议见 §2。
- **跨 GDD 一致性**：**PASS**（16 项共享常量全一致；4 项开放问题已 RESOLVED · 主理人推荐）。
- **设计理论红线**：**PASS**（无主导策略锁定、经济失衡有意识延后、认知过载受控、无支柱漂移）。
- **全局状态**：可进入实现联调；客户端预测/回滚已落定 R2 工程解（仍可由程基岩 Phase-3 微调）；随机实例 seed 生成待程基岩确认。
