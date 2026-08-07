// swagger-to-ts-generator.mjs
// 同构模块：既可在浏览器 <script type="module"> 中加载，也可被 Node import 做单测。
// 功能：把 Swagger 2.0 / OpenAPI 3.0 规范转换成 TypeScript 接口 + fetch / axios 请求函数。
// 零依赖，纯前端可跑（不依赖任何运行时库，适合做 demo）。

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

export function sanitizeName(name) {
  if (!name) return 'Unknown';
  let s = String(name).replace(/[^A-Za-z0-9_$]/g, '_');
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s;
}

export function pascalCase(str) {
  return sanitizeName(str)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function camelCase(str) {
  const p = pascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export function detectVersion(spec) {
  if (!spec || typeof spec !== 'object') return null;
  if (spec.swagger && String(spec.swagger).startsWith('2')) return 'swagger2';
  if (spec.openapi) return 'openapi3';
  return null;
}

export function isRef(schema) {
  return !!schema && typeof schema === 'object' && typeof schema.$ref === 'string';
}

export function refName(ref) {
  if (!ref) return null;
  const parts = ref.split('/');
  return sanitizeName(parts[parts.length - 1]);
}

export function resolveRef(ref, spec) {
  if (!ref) return null;
  const parts = ref.replace(/^#\//, '').split('/');
  let cur = spec;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur;
}

export function collectSchemas(spec) {
  const v = detectVersion(spec);
  if (v === 'openapi3') return spec.components?.schemas || {};
  if (v === 'swagger2') return spec.definitions || {};
  return {};
}

export function typeFromSchema(schema, spec) {
  if (schema == null) return 'unknown';
  if (isRef(schema)) return refName(schema.$ref);
  if (Array.isArray(schema)) return schema.map((s) => typeFromSchema(s, spec)).join(' | ');
  if (typeof schema !== 'object') return 'unknown';

  if (Array.isArray(schema.enum)) {
    const vals = schema.enum.map((e) =>
      typeof e === 'string' ? `'${String(e).replace(/'/g, "\\'")}'` : String(e),
    );
    return vals.length ? vals.join(' | ') : 'unknown';
  }
  if (Array.isArray(schema.allOf)) return schema.allOf.map((s) => typeFromSchema(s, spec)).join(' & ');
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map((s) => typeFromSchema(s, spec)).join(' | ');
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map((s) => typeFromSchema(s, spec)).join(' | ');

  const type = schema.type;
  if (type === 'array') {
    const items = schema.items ? typeFromSchema(schema.items, spec) : 'unknown';
    return `${items}[]`;
  }
  if (type === 'object' || schema.properties || schema.additionalProperties) {
    return objectType(schema, spec);
  }
  if (type === 'string') return 'string';
  if (type === 'integer' || type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'null') return 'null';
  if (schema.properties) return objectType(schema, spec);
  return 'unknown';
}

function objectType(schema, spec) {
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const lines = [];
  for (const [k, v] of Object.entries(props)) {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `'${k}'`;
    const t = typeFromSchema(v, spec);
    const opt = required.has(k) ? '' : '?';
    const nullable = v && (v.nullable || (Array.isArray(v.type) && v.type.includes('null'))) ? ' | null' : '';
    lines.push(`  ${key}${opt}: ${t}${nullable};`);
  }
  const addl = schema.additionalProperties;
  if (addl && addl !== false) {
    const vt = addl === true ? 'unknown' : typeFromSchema(addl, spec);
    lines.push(`  [key: string]: ${vt};`);
  }
  if (!lines.length) return 'Record<string, never>';
  return `{\n${lines.join('\n')}\n}`;
}

export function generateInterfaces(spec) {
  const schemas = collectSchemas(spec);
  const out = [];
  for (const [name, schema] of Object.entries(schemas)) {
    const tn = sanitizeName(name);
    const t = typeFromSchema(schema, spec);
    if (t.startsWith('{')) out.push(`export interface ${tn} ${t}\n`);
    else out.push(`export type ${tn} = ${t};\n`);
  }
  return out.join('\n');
}

function getParameters(spec, pathItem, op) {
  const raw = [...(pathItem.parameters || []), ...(op.parameters || [])];
  const result = { path: [], query: [], header: [], cookie: [], body: null };
  for (const p of raw) {
    if (isRef(p)) continue; // demo 不展开参数 $ref
    const loc = p.in;
    if (loc === 'body') {
      result.body = p.schema || { type: 'object' };
      continue;
    }
    if (loc === 'formData') {
      result.body = result.body || { type: 'object' };
      continue;
    }
    const entry = {
      name: p.name,
      required: !!p.required,
      // Swagger 2.0 的非 body 参数把 type/items/enum 直接挂在平面上，没有 schema 包装
      schema: p.schema || { type: p.type, items: p.items, enum: p.enum, format: p.format },
      in: loc,
    };
    if (loc === 'path') result.path.push(entry);
    else if (loc === 'query') result.query.push(entry);
    else if (loc === 'header') result.header.push(entry);
    else if (loc === 'cookie') result.cookie.push(entry);
  }
  if (op.requestBody) {
    const rb = isRef(op.requestBody) ? resolveRef(op.requestBody, spec) : op.requestBody;
    const content = rb?.content || {};
    const json =
      content['application/json'] ||
      content['application/x-www-form-urlencoded'] ||
      Object.values(content)[0];
    result.body = json?.schema ? json.schema : { type: 'object' };
  }
  return result;
}

function getResponseSchema(spec, op) {
  const responses = op.responses || {};
  const code =
    responses['200'] ||
    responses['201'] ||
    responses['2xx'] ||
    responses['default'] ||
    Object.values(responses)[0];
  if (!code) return { type: 'void' };
  const c = isRef(code) ? resolveRef(code, spec) : code;
  const content = c?.content || {};
  const json = content['application/json'] || Object.values(content)[0];
  if (json?.schema) return json.schema;
  if (c?.schema) return c.schema; // swagger 2.0
  return { type: 'void' };
}

export function opFunctionName(method, path, op) {
  if (op.operationId) return camelCase(op.operationId);
  const clean = path.replace(/[{}]/g, '').replace(/\/+/g, ' ').trim();
  return camelCase(`${method} ${clean}`);
}

function buildObjectTypeDef(props, spec) {
  if (!props.length) return null;
  const req = new Set(props.filter((p) => p.required).map((p) => p.name));
  const lines = props.map((p) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.name) ? p.name : `'${p.name}'`;
    const opt = req.has(p.name) ? '' : '?';
    return `  ${key}${opt}: ${typeFromSchema(p.schema, spec)};`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function buildPathTemplate(path, pathParams) {
  if (!pathParams.length) return path;
  let t = path;
  for (const p of pathParams) {
    t = t.replace(`{${p.name}}`, '${encodeURIComponent(' + camelCase(p.name) + ')}');
  }
  return t;
}

// 抽取单个 operation 的"结构化零件"，供单文件与文件树两种输出复用。
function buildOpParts(spec, method, path, pathItem, op) {
  const fnName = opFunctionName(method, path, op);
  const Name = pascalCase(fnName);
  const params = getParameters(spec, pathItem, op);
  const respSchema = getResponseSchema(spec, op);
  const respType = typeFromSchema(respSchema, spec);

  const typeDefs = [];
  typeDefs.push(`export type ${Name}Response = ${respType};`);
  if (params.body) {
    const bodyType = typeFromSchema(params.body, spec);
    typeDefs.push(`export type ${Name}Body = ${bodyType};`);
  }
  const allOptional = [...params.query, ...params.header, ...params.cookie];
  const paramsDef = buildObjectTypeDef(allOptional, spec);
  if (paramsDef) typeDefs.push(`export interface ${Name}Params ${paramsDef}`);

  // 函数签名
  const sigParts = [];
  for (const p of params.path) sigParts.push(`${camelCase(p.name)}: ${typeFromSchema(p.schema, spec)}`);
  if (params.body) sigParts.push(`data: ${Name}Body`);
  if (paramsDef) sigParts.push(`params?: ${Name}Params`);
  const sig = sigParts.join(', ');

  const pathTpl = buildPathTemplate(path, params.path);
  const verb =
    method === 'post' ? 'post' : method === 'get' ? 'get' : method === 'delete' ? 'delete' : method === 'put' ? 'put' : 'patch';

  const tag = Array.isArray(op.tags) && op.tags[0] ? sanitizeName(op.tags[0]) : 'api';

  return { fnName, Name, tag, sig, pathTpl, verb, method, path, params, hasBody: !!params.body, hasParamsType: !!paramsDef, typeDefs };
}

// 单文件模式下的函数体（内联 fetch / axios，并把该接口的类型声明贴在前面）
function buildSingleFileFn(parts, client) {
  const { fnName, Name, sig, pathTpl, method, path, params, hasParamsType, typeDefs } = parts;

  const fetchImpl = [];
  fetchImpl.push(`export async function ${fnName}(${sig}): Promise<${Name}Response> {`);
  fetchImpl.push(`  const base = BASE_URL;`);
  fetchImpl.push(`  let url = \`\${base}${pathTpl}\`;`);
  if (hasParamsType) {
    fetchImpl.push(`  if (params) {`);
    fetchImpl.push(`    const qs = new URLSearchParams();`);
    fetchImpl.push(`    for (const [k, v] of Object.entries(params)) {`);
    fetchImpl.push(`      if (v !== undefined && v !== null) qs.append(k, String(v));`);
    fetchImpl.push(`    }`);
    fetchImpl.push(`    const s = qs.toString();`);
    fetchImpl.push(`    if (s) url += (url.includes('?') ? '&' : '?') + s;`);
    fetchImpl.push(`  }`);
  }
  const initParts = [`method: '${method.toUpperCase()}'`];
  if (params.body) {
    initParts.push(`headers: { 'Content-Type': 'application/json' }`);
    initParts.push(`body: JSON.stringify(data)`);
  }
  fetchImpl.push(`  const res = await fetch(url, { ${initParts.join(', ')} });`);
  fetchImpl.push(`  if (!res.ok) throw new Error(\`HTTP \${res.status} \${res.statusText}\`);`);
  fetchImpl.push(`  if (res.status === 204) return undefined as unknown as ${Name}Response;`);
  fetchImpl.push(`  return (await res.json()) as ${Name}Response;`);
  fetchImpl.push(`}`);

  const axiosImpl = [];
  axiosImpl.push(`export async function ${fnName}(${sig}): Promise<${Name}Response> {`);
  const axiosArgs = [`\`${pathTpl}\``];
  if (params.body) axiosImpl.push(`  const _data = data;`);
  if (params.body) axiosArgs.push('_data');
  if (hasParamsType) axiosArgs.push('{ params }');
  axiosImpl.push(`  return http.${parts.verb}<${Name}Response>(${axiosArgs.join(', ')}).then(r => r.data);`);
  axiosImpl.push(`}`);

  const activeFetch = client !== 'axios';
  const active = activeFetch ? fetchImpl : axiosImpl;
  const inactive = activeFetch ? axiosImpl : fetchImpl;
  const inactiveCommented = inactive.map((l) => '// ' + l).join('\n');

  return (
    typeDefs.join('\n') +
    `\n\n// ${method.toUpperCase()} ${path}\n` +
    active.join('\n') +
    `\n\n${inactiveCommented}`
  );
}

export function genOne(spec, method, path, pathItem, op, client = 'fetch') {
  const parts = buildOpParts(spec, method, path, pathItem, op);
  const fn = buildSingleFileFn(parts, client);
  return { fnName: parts.fnName, Name: parts.Name, tag: parts.tag, typeDefs: parts.typeDefs, fn, method, path };
}

export function generateOperations(spec, opts = {}) {
  const client = opts.client || 'fetch';
  const paths = spec.paths || {};
  const funcs = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      funcs.push(genOne(spec, method, path, pathItem, op, client).fn);
    }
  }
  return funcs.join('\n\n');
}

export function generateClient(spec, opts = {}) {
  const client = opts.client || 'fetch';
  const v = detectVersion(spec);
  if (!v) {
    return `/* 无法识别的规范：既不是 Swagger 2.0 也不是 OpenAPI 3.x。请检查输入。 */`;
  }
  const header = [
    `/* 由 lilnong.top Swagger→TS 生成器生成（${v === 'openapi3' ? 'OpenAPI 3.x' : 'Swagger 2.0'}）`,
    ` * 生成客户端方式：${client}`,
    ` * 该文件由前端实时生成，仅作示例。生产环境建议用 swagger-typescript-api / openapi-typescript。`,
    ` */`,
    ``,
    client === 'axios' ? `import axios from 'axios';\nconst http = axios.create({ baseURL: BASE_URL });` : ``,
    `export const BASE_URL = '' as string; // TODO: 填上你的 API 地址`,
    ``,
  ].filter((l) => l !== undefined).join('\n');

  const interfaces = generateInterfaces(spec);
  const ops = generateOperations(spec, opts);
  return [header, interfaces ? `// ---------- 数据模型 ----------\n${interfaces}` : '', ops ? `// ---------- 请求函数 ----------\n${ops}` : '']
    .filter(Boolean)
    .join('\n\n');
}

// ---------- 文件树生成：类型统一进 types.d.ts，按 tag 拆接口文件 ----------

function buildHttpFile(client, v) {
  if (client === 'axios') {
    return [
      `// 由 lilnong.top Swagger→TS 生成器生成（${v === 'openapi3' ? 'OpenAPI 3.x' : 'Swagger 2.0'}）`,
      `// HTTP 客户端配置（axios 模式）`,
      `import axios from 'axios';`,
      ``,
      `export const BASE_URL = '' as string; // TODO: 填上你的 API 地址`,
      ``,
      `export const http = axios.create({ baseURL: BASE_URL });`,
      ``,
    ].join('\n');
  }
  return [
    `// 由 lilnong.top Swagger→TS 生成器生成（${v === 'openapi3' ? 'OpenAPI 3.x' : 'Swagger 2.0'}）`,
    `// HTTP 客户端配置（fetch 模式）`,
    ``,
    `export const BASE_URL = '' as string; // TODO: 填上你的 API 地址`,
    ``,
    `export async function request<T>(`,
    `  method: string,`,
    `  path: string,`,
    `  options?: { params?: object; data?: unknown },`,
    `): Promise<T> {`,
    `  let url = \`\${BASE_URL}\${path}\`;`,
    `  if (options?.params) {`,
    `    const qs = new URLSearchParams();`,
    `    for (const [k, v] of Object.entries(options.params)) {`,
    `      if (v !== undefined && v !== null) qs.append(k, String(v));`,
    `    }`,
    `    const s = qs.toString();`,
    `    if (s) url += (url.includes('?') ? '&' : '?') + s;`,
    `  }`,
    `  const init: RequestInit = { method };`,
    `  if (options?.data !== undefined) {`,
    `    init.headers = { 'Content-Type': 'application/json' };`,
    `    init.body = JSON.stringify(options.data);`,
    `  }`,
    `  const res = await fetch(url, init);`,
    `  if (!res.ok) throw new Error(\`HTTP \${res.status} \${res.statusText}\`);`,
    `  if (res.status === 204) return undefined as unknown as T;`,
    `  return (await res.json()) as T;`,
    `}`,
    ``,
  ].join('\n');
}

function buildTagFile(tag, partsList, client, v) {
  const usedTypes = new Set();
  const fns = [];
  for (const parts of partsList) {
    usedTypes.add(`${parts.Name}Response`);
    if (parts.hasBody) usedTypes.add(`${parts.Name}Body`);
    if (parts.hasParamsType) usedTypes.add(`${parts.Name}Params`);

    if (client === 'axios') {
      const axiosArgs = [`\`${parts.pathTpl}\``];
      const lines = [];
      if (parts.hasBody) {
        lines.push(`  const _data = data;`);
        axiosArgs.push('_data');
      }
      if (parts.hasParamsType) axiosArgs.push('{ params }');
      lines.push(`  return http.${parts.verb}<${parts.Name}Response>(${axiosArgs.join(', ')}).then(r => r.data);`);
      fns.push(
        `// ${parts.method.toUpperCase()} ${parts.path}\nexport async function ${parts.fnName}(${parts.sig}): Promise<${parts.Name}Response> {\n${lines.join('\n')}\n}`,
      );
    } else {
      const callOpts = [];
      if (parts.hasParamsType) callOpts.push('params');
      if (parts.hasBody) callOpts.push('data');
      const callOptsStr = callOpts.length ? `, { ${callOpts.join(', ')} }` : '';
      fns.push(
        `// ${parts.method.toUpperCase()} ${parts.path}\nexport async function ${parts.fnName}(${parts.sig}): Promise<${parts.Name}Response> {\n  return request<${parts.Name}Response>('${parts.method.toUpperCase()}', \`${parts.pathTpl}\`${callOptsStr});\n}`,
      );
    }
  }

  const typeImportLines = [...usedTypes].map((t) => `  ${t},`).join('\n');
  const clientImport = client === 'axios' ? `import { http } from './http';` : `import { request } from './http';`;

  return [
    `// ${tag} 相关接口（由 lilnong.top 生成器生成）`,
    clientImport,
    `import type {`,
    typeImportLines,
    `} from './types';`,
    ``,
    fns.join('\n\n'),
    ``,
  ].join('\n');
}

// 返回文件数组：[{ path, content }]。类型集中在 types.d.ts，按 tag 拆分接口模块。
export function generateFileTree(spec, opts = {}) {
  const client = opts.client || 'fetch';
  const v = detectVersion(spec);
  if (!v) {
    return [{ path: 'ERROR.txt', content: '/* 无法识别的规范：既不是 Swagger 2.0 也不是 OpenAPI 3.x。请检查输入。 */' }];
  }

  const paths = spec.paths || {};
  const partsByTag = {};
  const typeDefsAll = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      const parts = buildOpParts(spec, method, path, pathItem, op);
      (partsByTag[parts.tag] ||= []).push(parts);
      typeDefsAll.push(...parts.typeDefs);
    }
  }

  const interfaces = generateInterfaces(spec);
  const typesContent = [
    `// 由 lilnong.top Swagger→TS 生成器生成（${v === 'openapi3' ? 'OpenAPI 3.x' : 'Swagger 2.0'}）`,
    `// 数据模型与类型声明（独立文件，供各接口模块复用）`,
    ``,
    interfaces || `// （本规范没有可生成的组件/定义模型）`,
    ``,
    `// ---------- 接口级类型 ----------`,
    typeDefsAll.join('\n') || `// （无）`,
    ``,
  ].join('\n');

  const files = [];
  files.push({ path: 'types.d.ts', content: typesContent });
  files.push({ path: 'http.ts', content: buildHttpFile(client, v) });

  for (const [tag, partsList] of Object.entries(partsByTag)) {
    files.push({ path: `${tag}.ts`, content: buildTagFile(tag, partsList, client, v) });
  }

  const indexLines = ['// 统一入口：导出所有接口模块与类型', ''];
  for (const tag of Object.keys(partsByTag)) {
    indexLines.push(`export * from './${tag}';`);
  }
  indexLines.push(`export * from './types';`);
  indexLines.push(`export { BASE_URL } from './http';`);
  files.push({ path: 'index.ts', content: indexLines.join('\n') + '\n' });

  return files;
}

const api = {
  sanitizeName,
  pascalCase,
  camelCase,
  detectVersion,
  isRef,
  refName,
  resolveRef,
  collectSchemas,
  typeFromSchema,
  generateInterfaces,
  generateOperations,
  generateClient,
  generateFileTree,
  opFunctionName,
};

if (typeof window !== 'undefined') {
  window.SwaggerToTs = api;
}
export default api;
