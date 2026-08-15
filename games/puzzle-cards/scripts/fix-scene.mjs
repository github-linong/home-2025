#!/usr/bin/env node
/**
 * scripts/fix-scene.mjs
 * 场景去重：assets/main.scene 曾出现 Canvas 下挂多个 Main（重复 Main 组件 + 烘焙 UI 子树），
 * 运行时多个 Main.start() 会叠多层 UI。本脚本动态检测并清理：
 *   - 保留 Canvas 下第一个名为 Main 的节点（连同其 Main 组件），
 *   - 删除其余 Main 节点整棵子树，
 *   - 删除直接挂在 Canvas 节点上的 Main 组件（保留 UITransform/Canvas/Widget）。
 * 幂等：已清理时输出「already clean」并退出 0。
 * 用法：node scripts/fix-scene.mjs（--check 只校验不写回）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENE_PATH = path.join(path.resolve(__dirname, '..'), 'assets', 'main.scene');

const isCustomComp = (o) => o && typeof o.__type__ === 'string' && !o.__type__.startsWith('cc.');

function collectSubtree(scene, del, rootId) {
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (del.has(id)) continue;
    del.add(id);
    const obj = scene[id];
    if (!obj) continue;
    for (const c of obj._components || []) if (c && c.__id__ !== undefined) del.add(c.__id__);
    for (const ch of obj._children || []) if (ch && ch.__id__ !== undefined) queue.push(ch.__id__);
  }
}

function plan(scene) {
  const canvasComp = scene.find((o) => o && o.__type__ === 'cc.Canvas');
  if (!canvasComp) return { error: '场景中没有 cc.Canvas' };
  const canvasNode = scene[canvasComp.node.__id__];
  if (!canvasNode) return { error: 'Canvas 组件引用的节点缺失' };

  // Main 脚本组件类型 = 首个挂在名为 Main 节点上的自定义组件类型
  const scriptType = (() => {
    for (const r of canvasNode._children || []) {
      const node = scene[r.__id__];
      if (node && node._name === 'Main') {
        for (const c of node._components || []) {
          const comp = scene[c.__id__];
          if (isCustomComp(comp)) return comp.__type__;
        }
      }
    }
    return null;
  })();

  const mainNodes = (canvasNode._children || [])
    .map((r) => r.__id__)
    .filter((id) => {
      const node = scene[id];
      return node && node._name === 'Main' && (node._components || []).some((c) => scene[c.__id__] && scene[c.__id__].__type__ === scriptType);
    });

  if (scriptType === null || mainNodes.length === 0) {
    return { error: 'Canvas 下没有带 Main 组件的节点' };
  }
  if (mainNodes.length === 1) return { clean: true };

  const del = new Set();
  for (const id of mainNodes.slice(1)) collectSubtree(scene, del, id);
  // 直接挂在 Canvas 上的 Main 组件（保留节点本身，删组件对象）
  for (const c of canvasNode._components || []) {
    if (scene[c.__id__] && scene[c.__id__].__type__ === scriptType) del.add(c.__id__);
  }
  return { del, keepMain: mainNodes[0] };
}

function validate(scene, del) {
  const errors = [];
  scene.forEach((obj, i) => {
    if (del.has(i)) return;
    const walk = (o, where) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, where)); return; }
      if (o.__id__ !== undefined) {
        if (del.has(o.__id__)) errors.push(`${where} → 悬空引用 ${o.__id__}`);
        return;
      }
      for (const k of Object.keys(o)) walk(o[k], `${where}.${k}`);
    };
    walk(obj, `[${i}]`);
  });
  return errors;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const scene = JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8'));
  const p = plan(scene);

  if (p.error) {
    console.error('❌', p.error);
    process.exit(1);
  }
  if (p.clean) {
    console.log('✅ already clean（仅一个 Main，无需处理）');
    return;
  }

  const { del } = p;
  const kept = scene.filter((_, i) => !del.has(i));
  kept.forEach((obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of ['_children', '_components']) {
      if (Array.isArray(obj[k])) obj[k] = obj[k].filter((ref) => !(ref && ref.__id__ !== undefined && del.has(ref.__id__)));
    }
  });

  const errors = validate(kept, del);
  if (errors.length) {
    console.error('❌ 保留对象存在悬空引用，中止：');
    errors.slice(0, 20).forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  const keepIdx = scene.map((_, i) => i).filter((i) => !del.has(i));
  const remap = new Map(keepIdx.map((old, i) => [old, i]));
  const next = keepIdx.map((old) => scene[old]);
  const remapRefs = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(remapRefs); return; }
    if (obj.__id__ !== undefined) { obj.__id__ = remap.get(obj.__id__); return; }
    for (const k of Object.keys(obj)) remapRefs(obj[k]);
  };
  next.forEach(remapRefs);

  if (checkOnly) {
    console.log(`--check：将删除 ${del.size} 个对象（${scene.length} → ${next.length}）`);
    return;
  }

  fs.writeFileSync(SCENE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`✅ 已写回 ${SCENE_PATH}（${scene.length} → ${next.length} 个对象）`);
}

main();
