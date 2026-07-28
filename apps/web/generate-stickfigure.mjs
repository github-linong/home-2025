/**
 * Generate a stick figure (火柴人) 3D model as GLB file.
 * Uses three.js for geometry creation, manually constructs GLB binary.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'fs';

// ─── Color palette ───────────────────────────────────────────
const SKIN   = [0.95, 0.78, 0.65];   // skin tone
const SHIRT  = [0.25, 0.55, 0.90];   // blue shirt
const PANTS  = [0.20, 0.20, 0.30];   // dark pants
const SHOE   = [0.15, 0.10, 0.08];   // dark brown shoes
const HAIR   = [0.18, 0.12, 0.08];   // dark hair
const EYE    = [0.10, 0.10, 0.10];   // eyes

// ─── Geometry helpers ────────────────────────────────────────
function makeCylinder(radiusTop, radiusBottom, height, pos, rotAxis, rotAngle, color, segments = 12) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  if (rotAxis && rotAngle) {
    const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, rotAngle);
    geo.applyQuaternion(q);
  }
  geo.translate(pos[0], pos[1], pos[2]);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(geo.attributes.position.count).fill(null).flatMap(() => color), 3
  ));
  return geo;
}

function makeSphere(radius, pos, color, wSeg = 16, hSeg = 12) {
  const geo = new THREE.SphereGeometry(radius, wSeg, hSeg);
  geo.translate(pos[0], pos[1], pos[2]);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(geo.attributes.position.count).fill(null).flatMap(() => color), 3
  ));
  return geo;
}

function makeBox(w, h, d, pos, color, rotAxis, rotAngle) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rotAxis && rotAngle) {
    const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, rotAngle);
    geo.applyQuaternion(q);
  }
  geo.translate(pos[0], pos[1], pos[2]);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(geo.attributes.position.count).fill(null).flatMap(() => color), 3
  ));
  return geo;
}

// ─── Build the stick figure ──────────────────────────────────
// Proportions: total height ~1.8 units, standing pose
const parts = [];

// Head
parts.push(makeSphere(0.12, [0, 1.58, 0], SKIN, 20, 16));

// Hair (slightly larger sphere, flattened on top)
const hair = makeSphere(0.125, [0, 1.62, -0.01], HAIR, 20, 12);
// Scale to make it more like a cap
const hairMatrix = new THREE.Matrix4().makeScale(1.02, 0.85, 1.05);
hair.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -1.62 + 0.01, 0.01));
hair.applyMatrix4(hairMatrix);
hair.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.62 - 0.01, -0.01));
parts.push(hair);

// Eyes (two small dark spheres)
parts.push(makeSphere(0.02, [-0.04, 1.59, 0.11], EYE, 8, 6));
parts.push(makeSphere(0.02, [0.04, 1.59, 0.11], EYE, 8, 6));

// Neck
parts.push(makeCylinder(0.04, 0.05, 0.08, [0, 1.44, 0], null, 0, SKIN));

// Torso (upper body - shirt)
parts.push(makeCylinder(0.14, 0.11, 0.40, [0, 1.20, 0], null, 0, SHIRT));

// Lower torso / hips
parts.push(makeCylinder(0.11, 0.13, 0.15, [0, 0.94, 0], null, 0, PANTS));

// ── Left arm ──
const L_ARM_ANGLE = 0.35; // slightly away from body
// Upper arm
parts.push(makeCylinder(0.04, 0.035, 0.28,
  [-0.22, 1.25, 0],
  new THREE.Vector3(0, 0, 1), L_ARM_ANGLE, SHIRT));
// Forearm
parts.push(makeCylinder(0.035, 0.03, 0.26,
  [-0.33, 1.00, 0.03],
  new THREE.Vector3(0, 0, 1), L_ARM_ANGLE * 0.6, SKIN));
// Hand
parts.push(makeSphere(0.035, [-0.39, 0.85, 0.04], SKIN, 10, 8));

// ── Right arm ──
// Upper arm
parts.push(makeCylinder(0.04, 0.035, 0.28,
  [0.22, 1.25, 0],
  new THREE.Vector3(0, 0, 1), -L_ARM_ANGLE, SHIRT));
// Forearm
parts.push(makeCylinder(0.035, 0.03, 0.26,
  [0.33, 1.00, 0.03],
  new THREE.Vector3(0, 0, 1), -L_ARM_ANGLE * 0.6, SKIN));
// Hand
parts.push(makeSphere(0.035, [0.39, 0.85, 0.04], SKIN, 10, 8));

// ── Left leg ──
const L_LEG_ANGLE = 0.12;
// Upper leg
parts.push(makeCylinder(0.055, 0.045, 0.36,
  [-0.08, 0.68, 0],
  new THREE.Vector3(0, 0, 1), L_LEG_ANGLE, PANTS));
// Lower leg
parts.push(makeCylinder(0.045, 0.035, 0.36,
  [-0.11, 0.32, 0],
  new THREE.Vector3(0, 0, 1), L_LEG_ANGLE * 0.5, PANTS));
// Shoe
parts.push(makeBox(0.07, 0.05, 0.14, [-0.12, 0.025, 0.03], SHOE));

// ── Right leg ──
// Upper leg
parts.push(makeCylinder(0.055, 0.045, 0.36,
  [0.08, 0.68, 0],
  new THREE.Vector3(0, 0, 1), -L_LEG_ANGLE, PANTS));
// Lower leg
parts.push(makeCylinder(0.045, 0.035, 0.36,
  [0.11, 0.32, 0],
  new THREE.Vector3(0, 0, 1), -L_LEG_ANGLE * 0.5, PANTS));
// Shoe
parts.push(makeBox(0.07, 0.05, 0.14, [0.12, 0.025, 0.03], SHOE));

// ─── Merge all parts ─────────────────────────────────────────
const merged = mergeGeometries(parts, false);
merged.computeBoundingSphere();

// ─── Extract binary buffer ───────────────────────────────────
const posAttr = merged.attributes.position;
const normAttr = merged.attributes.normal;
const colorAttr = merged.attributes.color;
const indexAttr = merged.index;

const positions = new Float32Array(posAttr.array);
const normals = new Float32Array(normAttr.array);
const colors = new Float32Array(colorAttr.array);
const indices = new Uint16Array(indexAttr.array);

// Compute bounding box
const bs = merged.boundingSphere;
const minX = bs.center.x - bs.radius, maxX = bs.center.x + bs.radius;
const minY = bs.center.y - bs.radius, maxY = bs.center.y + bs.radius;
const minZ = bs.center.z - bs.radius, maxZ = bs.center.z + bs.radius;

// ─── Build GLB ───────────────────────────────────────────────
// Buffer layout: [indices | positions | normals | colors] with alignment
const indicesBytes = indices.byteLength;
const posBytes = positions.byteLength;
const normBytes = normals.byteLength;
const colorBytes = colors.byteLength;

// Align to 4 bytes
function align4(n) { return (n + 3) & ~3; }

const indOff = 0;
const posOff = align4(indOff + indicesBytes);
const normOff = align4(posOff + posBytes);
const colOff = align4(normOff + normBytes);
const totalBin = align4(colOff + colorBytes);

const bin = Buffer.alloc(totalBin, 0);
Buffer.from(indices.buffer, indices.byteOffset, indicesBytes).copy(bin, indOff);
Buffer.from(positions.buffer, positions.byteOffset, posBytes).copy(bin, posOff);
Buffer.from(normals.buffer, normals.byteOffset, normBytes).copy(bin, normOff);
Buffer.from(colors.buffer, colors.byteOffset, colorBytes).copy(bin, colOff);

// glTF JSON
const gltf = {
  asset: { version: "2.0", generator: "stickfigure-generator" },
  scene: 0,
  scenes: [{ name: "Scene", nodes: [0] }],
  nodes: [{ name: "StickFigure", mesh: 0 }],
  meshes: [{
    name: "StickFigureMesh",
    primitives: [{
      attributes: { POSITION: 1, NORMAL: 2, COLOR_0: 3 },
      indices: 0,
      material: 0,
      mode: 4  // TRIANGLES
    }]
  }],
  materials: [{
    name: "VertexColor",
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0.0,
      roughnessFactor: 0.7
    },
    // Enable vertex colors
  }],
  accessors: [
    { // 0: indices
      bufferView: 0,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: indices.length,
      type: "SCALAR",
      max: [Math.max(...indices)],
      min: [Math.min(...indices)]
    },
    { // 1: positions
      bufferView: 1,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: positions.length / 3,
      type: "VEC3",
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ]
    },
    { // 2: normals
      bufferView: 2,
      byteOffset: 0,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
      max: [1, 1, 1],
      min: [-1, -1, -1]
    },
    { // 3: colors
      bufferView: 3,
      byteOffset: 0,
      componentType: 5126,
      count: colors.length / 3,
      type: "VEC3",
      max: [1, 1, 1],
      min: [0, 0, 0]
    }
  ],
  bufferViews: [
    { buffer: 0, byteOffset: indOff,  byteLength: indicesBytes, target: 34963 }, // ELEMENT_ARRAY_BUFFER
    { buffer: 0, byteOffset: posOff,  byteLength: posBytes,     target: 34962, byteStride: 12 }, // ARRAY_BUFFER
    { buffer: 0, byteOffset: normOff, byteLength: normBytes,    target: 34962, byteStride: 12 },
    { buffer: 0, byteOffset: colOff,  byteLength: colorBytes,   target: 34962, byteStride: 12 }
  ],
  buffers: [{
    byteLength: totalBin
  }]
};

// Fix material to use vertex colors via KHR_materials_unlit or just rely on standard PBR + COLOR_0
// For PBR + vertex colors, the COLOR_0 is multiplied with baseColorFactor automatically

const jsonStr = JSON.stringify(gltf);
// Pad JSON to 4-byte alignment with spaces
const jsonPad = (4 - (jsonStr.length % 4)) % 4;
const jsonBuf = Buffer.from(jsonStr + ' '.repeat(jsonPad), 'utf8');

// GLB header
const HEADER_LEN = 12;
const CHUNK_HDR = 8;
const totalLength = HEADER_LEN + CHUNK_HDR + jsonBuf.length + CHUNK_HDR + bin.length;

const glb = Buffer.alloc(totalLength);
let offset = 0;

// Header: magic, version, length
glb.writeUInt32LE(0x46546C67, offset); offset += 4; // "glTF"
glb.writeUInt32LE(2, offset);           offset += 4; // version 2
glb.writeUInt32LE(totalLength, offset); offset += 4;

// JSON chunk
glb.writeUInt32LE(jsonBuf.length, offset); offset += 4;
glb.writeUInt32LE(0x4E4F534A, offset);    offset += 4; // "JSON"
jsonBuf.copy(glb, offset);                offset += jsonBuf.length;

// BIN chunk
glb.writeUInt32LE(bin.length, offset);    offset += 4;
glb.writeUInt32LE(0x004E4942, offset);    offset += 4; // "BIN\0"
bin.copy(glb, offset);

// ─── Write file ──────────────────────────────────────────────
const outPath = 'public/models/stickfigure.glb';
fs.writeFileSync(outPath, glb);

console.log(`✅ Stick figure model generated!`);
console.log(`   File: ${outPath}`);
console.log(`   Size: ${(glb.length / 1024).toFixed(1)} KB`);
console.log(`   Vertices: ${positions.length / 3}`);
console.log(`   Triangles: ${indices.length / 3}`);
console.log(`   Parts: ${parts.length}`);
