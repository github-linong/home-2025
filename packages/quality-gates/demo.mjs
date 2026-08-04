// 端到端演示：需求 -> 生成(带 manifest 约束) -> 跑闸门 -> 出 QA 报告
import { runHarness, mockGenerate, defaultGates } from './src/index.js';

function printReport(title, report) {
  console.log(`\n=== ${title} ===`);
  console.log(`状态：${report.status}`);
  console.log(`质量分：${report.score}`);
  console.log(`需要人审：${report.needsHumanReview ? '是（异常驱动）' : '否（自动放行）'}`);
  console.log('闸门明细：');
  for (const g of report.gates) {
    const tag = g.pass ? 'PASS' : `FAIL[${g.severity}]`;
    console.log(`  - ${g.name.padEnd(10)} ${tag}  ${g.message}`);
  }
  if (report.suggestions.length) {
    console.log('改进建议：');
    for (const s of report.suggestions) console.log(`  * ${s}`);
  }
}

// 场景一：合规产物（六道确定性闸全过 -> 自动放行）
const requirement = '用通俗语言讲清楚 React 的 useEffect 依赖数组';
const constraints = { docType: 'tutorial', audience: '前端初学者', lengthWords: 800 };
const experienceStore = [];

const good = await runHarness({
  requirement,
  constraints,
  generate: (req, c) => mockGenerate(req, c),
  gates: defaultGates(),
  experienceStore,
});
printReport('场景一：合规产物（应 pass / 100）', good);

// 场景二：有瑕疵的产物（触发新增的 links / seo / format 收紧闸 -> review）
const badContent = [
  '# 标题',
  '',
  '## 背景',
  '',
  '## 核心',
  '这里是核心内容，但下面直接跳到 H3，且结尾有占位外链。',
  '### 子点',
  '',
  '延伸阅读见 [示例](https://example.com/x)。',
].join('\n');

const bad = await runHarness({
  requirement: '示例需求',
  constraints: { docType: 'doc' },
  generate: async () => ({ id: 'bad', kind: 'markdown', content: badContent, manifest: { minSections: 2 } }),
  gates: defaultGates(),
  experienceStore,
});
printReport('场景二：瑕疵产物（应 review，展示新闸）', bad);

console.log(`\n经验库样本数：${experienceStore.length}（失败信号已被记录，供自我优化闭环）`);

