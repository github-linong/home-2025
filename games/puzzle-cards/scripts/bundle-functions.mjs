// scripts/bundle-functions.mjs
// 微信云开发的每个云函数独立部署，共享的 cloud/model 不会自动包含。
// 本脚本把 cloud/model 复制到每个 cloud/functions/<name>/model，并为缺省函数生成 package.json。
// 运行：node scripts/bundle-functions.mjs  （在上传云函数前执行一次）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FUNC_DIR = path.join(ROOT, 'cloud/functions');
const MODEL_DIR = path.join(ROOT, 'cloud/model');

const fns = fs.readdirSync(FUNC_DIR).filter((f) => fs.statSync(path.join(FUNC_DIR, f)).isDirectory());
for (const fn of fns) {
  const target = path.join(FUNC_DIR, fn, 'model');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(MODEL_DIR, target, { recursive: true });
  const pkg = path.join(FUNC_DIR, fn, 'package.json');
  if (!fs.existsSync(pkg)) {
    fs.writeFileSync(pkg, JSON.stringify({ name: fn, version: '1.0.0', main: 'index.js', dependencies: { 'wx-server-sdk': '~2.6.3' } }, null, 2));
  }
}
console.log(`✅ bundled model into ${fns.length} functions:`, fns.join(', '));
