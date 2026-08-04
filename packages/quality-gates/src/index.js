// 公共入口：框架可被 apps/api2、apps/web 直接 import
export { gateResult, SEVERITY } from './gate.js';
export { createManifestGate } from './gates/manifest.js';
export { createFormatGate } from './gates/format.js';
export { createSafetyGate } from './gates/safety.js';
export { createSimilarityGate } from './gates/similarity.js';
export { createJudgeGate } from './gates/judge.js';
export { createLinksGate } from './gates/links.js';
export { createSeoGate } from './gates/seo.js';
export { runHarness } from './orchestrator.js';
export { mockGenerate, apiGenerate, buildManifest } from './generate.js';
export { ExperienceStore, optimize, evaluate, VersionedConfig } from './optimizer.js';
export { saveArtifact, listVersions, readVersion } from './store.js';

import { createManifestGate } from './gates/manifest.js';
import { createFormatGate } from './gates/format.js';
import { createSafetyGate } from './gates/safety.js';
import { createSimilarityGate } from './gates/similarity.js';
import { createLinksGate } from './gates/links.js';
import { createSeoGate } from './gates/seo.js';

// 默认闸门集（确定性，由快到慢）：契约 -> 几何 -> 合规 -> 基线 -> 链接卫生 -> 结构SEO
// judge（主观）由调用方在有 LLM 时额外追加。
export function defaultGates(opts = {}) {
  return [
    createManifestGate(),
    createFormatGate(opts.format),
    createSafetyGate(),
    createSimilarityGate(opts.similarity),
    createLinksGate(opts.links),
    createSeoGate(opts.seo),
  ];
}
