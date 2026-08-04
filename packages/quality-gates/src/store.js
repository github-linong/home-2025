// 产物版本化 + 灰度回滚兜底（文章「可观测版本化 + 灰度回滚兜底」）
// 每次产物落盘为一份版本（md + json 元数据），可列出、可回滚。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_ROOT = path.resolve(process.cwd(), 'artifacts', 'harness');

export async function saveArtifact(artifact, meta = {}, root = DEFAULT_ROOT) {
  await fs.mkdir(root, { recursive: true });
  const id = artifact.id || randomUUID();
  const md = `# ${meta.requirement || 'harness-artifact'}\n\n${artifact.content}`;
  await fs.writeFile(path.join(root, `${id}.md`), md, 'utf8');
  const record = {
    id,
    at: new Date().toISOString(),
    requirement: meta.requirement,
    constraints: meta.constraints,
    status: meta.status,
    score: meta.score,
    gates: meta.gates,
  };
  await fs.writeFile(path.join(root, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export async function listVersions(root = DEFAULT_ROOT) {
  try {
    const files = await fs.readdir(root);
    const out = [];
    for (const f of files.filter((f) => f.endsWith('.json')).sort().reverse()) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(root, f), 'utf8')));
      } catch {
        /* 跳过损坏记录 */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function readVersion(id, root = DEFAULT_ROOT) {
  try {
    return await fs.readFile(path.join(root, `${id}.md`), 'utf8');
  } catch {
    return null;
  }
}
