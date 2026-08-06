# E2 烟雾测试清单（最小可跑）
路径：tests/smoke/e2-smoke.md ｜ 作者：严守真（quality-lead）
前置：Node 22.6+（已用 v22.22.2 验证）；cwd = packages/sim-core

## 步骤 1 — sim-core 加载自检（确认无语法/解析/依赖错误）
```bash
node --experimental-strip-types -e "
import('./src/types.ts').then(t => {
  if (!t.EntityStatus || !t.PLAYER_CLASSES || !t.ENEMY_PROTOTYPES) throw new Error('types.ts 导出缺失');
  console.log('types.ts OK:', t.PLAYER_CLASSES.length, 'classes,', Object.keys(t.ENEMY_PROTOTYPES).length, 'enemy prototypes');
});
import('./src/rng.ts').then(r => {
  if (typeof r.Rng !== 'function') throw new Error('rng.ts Rng 缺失');
  console.log('rng.ts OK');
});
"
```

## 步骤 2 — RNG 同 seed 一致性 + golden 锚点（E2 核心 smoke）
```bash
node --experimental-strip-types --test tests/unit/rng.test.ts tests/golden/determinism.test.ts tests/unit/types.test.ts
# 期望：# pass N / # fail 0（含 rng 8 + types 不变量）
```

## 步骤 3（建议，C-A）— 类型检查门
```bash
npx tsc --noEmit   # devDep 装好后接入 CI；当前已配 script + strict tsconfig
```

## 烟雾 PASS 判据
- 步骤1 无报错且打印 OK；步骤2 pass>0 fail=0。两者皆满足 → E2 smoke PASS。
- C10 重连无跳变 / C5 perf / C11 安全 不在本 smoke（属 E1/E5/E7，见 qa-plan-e2 §2）。
