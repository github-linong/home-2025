import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveArtifact, listVersions, readVersion } from '../src/store.js';

test('save -> list -> read 版本化闭环', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hg-'));
  const rec = await saveArtifact(
    { id: 'a1', content: '正文内容' },
    { requirement: 'R', status: 'pass', score: 90, gates: [] },
    root,
  );
  assert.equal(rec.id, 'a1');
  const list = await listVersions(root);
  assert.equal(list.length, 1);
  const md = await readVersion('a1', root);
  assert.match(md, /正文内容/);
});
