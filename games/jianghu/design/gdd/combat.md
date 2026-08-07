# GDD · 战斗系统（技能 CD / 格挡 / 连招 / BOSS）

> 系统编号：SYS-02　|　作者：design-strategist　|　版本：v0.1（Phase-2 初稿）
> 关联概念：concept.md §7.2、§8.3（决策 C：3–4 技能带 CD；P3 格挡反击；⑥ Boss 三档）

---

## ① 目标与范围
- **目标**：网格节奏下的实时动作战斗，强调"格挡时机 > 站桩"；含 BOSS 战机制；**MVP 仅 PvE（决策 A 纯合作）**。
- **范围（含）**：普攻、3–4 技能（CD）、格挡窗口、连招雏形、伤害结算、仇恨、BOSS 阶段/特殊技、死亡→安全区复活。
- **范围（不含）**：PvP、装备 UI（归掉装/持久化）、移动本身（归移动系统）。

## ② 核心机制
- **技能组**：3–4 个槽位，各自独立 CD；释放为瞬时/短前摇，受移动系统站位影响。
- **格挡窗口**：玩家在"受击落地前 `PARRY_WINDOW` ms 内"输入格挡 → 触发减伤 + 硬直/反伤。**【已决·主理人推荐】MVP 服务端窗口 = `PARRY_TICKS=3`（250ms），闭区间 `windowEndTick=tick+PARRY_TICKS-1`（O3 已修），量化见 ADR-JH-ENG-01 §2；硬直/反伤为 Phase-2 待办（见 §⑧ D3）。**
- **连招雏形**：特定技能顺序（如 技1→技2）触发额外效果（伤害/破防），**不强制**，为操作深度预留。
- **伤害公式**（与 concept §7.2 一致，单位明确）：
```
Damage(final) = max( 1 , ATK_eff × SkillMult − DEF_eff )      [HP 点]
ATK_eff = BaseATK × (1 + ΣAffix_ATK% + STR × k_str)            [攻击点]
DEF_eff = BaseDEF × (1 + ΣAffix_DEF% + VIT × k_vit)            [防御点]
格挡成功 = 伤害 × (1 − ParryReduction) ，并触发硬直/反伤       [ParryReduction≈0.6]
```
- **仇恨（co-op）**：攻击/治疗产生仇恨值，怪物锁定最高仇恨玩家；支撑无组队 UI 的事实 co-op（P1）。**【Phase-2 待办（D4）】MVP 实现为「最近存活玩家」接触攻击、无 threat 表；仇恨表+锁定最高威胁+安全区不可被锁定归 Phase-2。**
- **BOSS 机制**：高 HP/ATK，按血量阈值进入阶段，释放范围/特殊技；掉落更好词缀（见掉装系统）。**【已决·主理人推荐】MVP 为 2 阶段 @50% hp（`BOSS_PHASE_THRESHOLD=0.5`，playtest 实证 hp=120<150 进 phase2）；3 阶段（阈值 66%/33%）+ 特殊技（CD 8–12s）归 Phase-2（D1）。**

## ③ 数据模型 / 状态
```
Skill { id, slot, cdTicks, damageMult, castRange, effectTag }
Combatant {
  HP, maxHP, ATK, DEF,                  ; 由属性(STR/DEX/VIT)+词缀推导
  str, dex, vit,                       ; 三系属性 (已去"内")
  skillCd: [ticksLeft×N],
  parryState: { active, windowEndTick },
  buffs/debuffs: [],
}
BossPhase { thresholdPct, specialSkill, enraged }
仇恨表: Map<monsterId, Map<playerId, threat>>
```

## ④ 与其他系统依赖
- **移动**：站位决定技能命中范围与格挡判定；释放期间移动约束。
- **属性（隐含于持久化/角色）**：STR/DEX/VIT 推导 ATK/DEF/攻速。
- **掉装**：词缀供给 ATK%/DEF/暴击/攻速/吸血等数值；BOSS 掉落由掉装系统产出。
- **刷怪**：提供战斗目标（普通/精英/BOSS）与仇恨绑定。
- **持久化**：等级、属性、装备影响战力；死亡复活落安全区。

## ⑤ 边界与异常
- **格挡与服务端延迟**：高延迟下客户端"看起来格挡成功"但服务端判定失败 → 需预测+回滚（待程基岩对齐）。
- **多人同目标**：同怪物多玩家伤害按各自结算，仇恨独立；击杀归属按最后一击/最高仇恨。
- **释放中移动**：技能前摇期间禁止移动（或减速），由战斗下发约束给移动系统。
- **死亡**：HP≤0 → 在安全区复活，**不掉永久装备**（决策④），副本内可设临时惩罚（Phase-2）。

## ⑥ 平衡初值
- 技能 CD：`3–8s`（按技能定位）；普攻无 CD 但有攻击间隔。
- `PARRY_WINDOW = 200ms`（设计意图）→ **已决·主理人推荐**：服务端实现量化为 `PARRY_TICKS=3` = 250ms，闭区间 `windowEndTick = tick + PARRY_TICKS - 1`（O3 已修；见 ADR-JH-ENG-01 §2）。`ParryReduction = 0.6`。硬直 300ms 为 **Phase-2 待办（D3）**：MVP 仅减伤 0.6，无反伤/硬直。
- 连招额外伤害 `+20%`（雏形，非强制）。**【Phase-2 待办（D6）】MVP 不实现连招（§⑧ 已标注可接受）。**
- BOSS：`HP ≈ 普通 ×10`、`ATK ≈ 普通 ×10`；**已决·主理人推荐：MVP 2 阶段 @50% hp**（`BOSS_PHASE_THRESHOLD=0.5`）；3 阶段（阈值 66%/33%）+ 特殊技（CD 8–12s）归 Phase-2（D1）。
- 属性增益：`k_str=2 ATK/点`、`k_vit=10 HP/点`、`dex`→攻速/命中系数。

## ⑦ 可测试性 / 验收
- **公式单测**：固定 STR/VIT/词缀，断言 `Damage(final)` 与格挡后数值符合公式。
- **格挡边界**：在 `PARRY_WINDOW` ±1ms 注入输入，断言成功/失败切换正确。
- **BOSS 阶段**：血量跨阈值时阶段切换与特殊技触发断言。
- **co-op 仇恨**：多玩家攻击同怪，断言仇恨最高者被锁定。
- **验收标准**：格挡判定在 ≤150ms 延迟下准确率 ≥95%；**MVP：BOSS 二阶段（@50%）可完整触发**（三阶段验收归 Phase-2）。

## ⑧ 开放问题 / 风险
- **主导策略风险**：若格挡无敌帧过长会废掉其他技能 → 监控，必要时缩短窗口/加后摇。O3 off-by-one 已修（333ms→250ms），当前窗口 250ms 未触红线；真浏览器试玩复核（见 design-review-s1 O3）。
- **延迟手感**【已决·主理人推荐】：不采用全量回滚；以「移动输入预测 + 100ms 插值 + 格挡/技能服务端校验时间窗」实现（R2 工程解），待 Phase-3 程基岩架构验证微调。
- **连招是否强制**：本期为"雏形不强制"，避免认知过载（护 P5）；Phase-2 再定深度（D6 已标 Phase-2 待办）。
- **BOSS 难度**：需与刷怪/掉装联调，避免碾压或劝退（见 concept §8.2）。
- **Phase-2 待办（design-review-s1 O1 回填，原文保留，不删）**：
  - **D1** BOSS 三阶段（66%/33%）+ 特殊技（CD 8–12s）——MVP 2 阶段 @50%（已决，见 §②§⑥§⑦）。
  - **D2** telegraph 预警实体：代码已有 schema + `MIN_TELEGRAPH_TICKS=8`（constants.ts），缺 world 生成 + 快照下发；P3 支柱，浏览器客户端里程碑前补数据源。
  - **D3** 格挡硬直 300ms + 反伤：MVP 仅减伤 0.6（见 §⑥）。
  - **D4** 仇恨表 / 锁定最高威胁 + 安全区不可被锁定（与 spawning §② / movement §② 联动）。
  - **D6** 连招 +20%（雏形不强制，MVP 不实现）。
