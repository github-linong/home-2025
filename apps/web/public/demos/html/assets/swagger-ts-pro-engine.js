/**
 * Swagger/OpenAPI to TypeScript Pro Engine
 * 完整功能：解析 v2/v3 → 校验 → 过滤 → 类型生成 → API生成 → Mock生成 → 文件树输出
 */
class SwaggerTSEngine {
  constructor() {
    this.raw = '';
    this.spec = null;       // normalized internal spec
    this.config = this._defaultConfig();
    this._typeRegistry = {};  // refName → resolved schema
    this._generatedTypes = {}; // refName → TS type string
    this._usedTypes = new Set();
    this._fnNames = [];
    this._issueLog = [];   // issues found during processing
    this._prettierReady = false;
  }

  /* ======== 配置默认值 ======== */
  _defaultConfig() {
    return {
      // 输出
      outputMode: 'tree',          // 'single' | 'tree'
      splitBy: 'tag',              // 'tag' | 'path' | 'controller'
      // 类型
      generateTypes: true,
      typesFile: 'types.ts',
      enumStyle: 'union',          // 'union' | 'enum'
      filterUnusedTypes: true,
      // HTTP 客户端
      httpClient: 'axios',         // 'axios' | 'fetch' | 'custom'
      httpLibraryName: 'axios',    // 请求库名称，用于 import 语句
      customHttpModule: '@/utils/request',
      baseURL: '',
      apiPrefix: '',
      contentPath: '',             // 统一 URL 前缀（附加在 apiPrefix 之后）
      // 返回值包装
      responseWrapper: 'none',     // 'none' | 'standard' | 'custom'
      responseWrapperType: 'ApiResponse<T>',
      // returnKey: 从响应体提取字段，如 'data' | 'result.list'
      returnKey: '',
      // 命名
      functionNaming: 'path',      // 'operationId' | 'path' | 'custom'
      functionNameTemplate: '{method}{path}',
      fileNameTemplate: '{tag}',
      functionStyle: 'function',   // 'function' | 'arrow' | 'const'
      funNameSuffix: '',           // 函数名后缀，如 'Api' / 'Service'

      // ==== 高级过滤器（支持字符串/正则/函数/命名空间） ====
      // controllerIncludes / controllerExcludes: 按 tag 过滤
      // 每个元素可以是: "tagName" | /regex/ | function(tag, op) => bool | { pattern: ..., namespace: "..." }
      controllerIncludes: [],
      controllerExcludes: [],
      // pathIncludes / pathExcludes: 按 path 过滤，同样支持字符串/正则/函数
      pathIncludes: [],
      pathExcludes: [],
      // filterMethods: HTTP 方法白名单
      filterMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],

      // 兼容旧配置项（自动迁移到 controller/path 过滤器）
      includeTags: [],
      excludeTags: [],
      includePaths: [],
      excludePaths: [],
      includeMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],

      // 文件头注入代码（每个生成文件顶部插入）
      leadingCode: '',

      // Mock
      generateMocks: false,
      mocksFile: 'mocks.ts',
      mockEngine: 'builtin',       // 'builtin' | 'mockjs' | 'heuristic'
      mockjsCdn: 'https://unpkg.com/mockjs/dist/mock.js',
      // 请求体
      requestBodyOptional: false,
      // 响应
      responseTypeOnly: false,
      // ContentType
      defaultContentType: 'application/json',
      contentTypeMap: {},   // { "/path:method": "multipart/form-data" } per-op overrides
      // Prettier
      prettierEnabled: false,
      prettierTabWidth: 2,
      prettierSemi: true,
      prettierSingleQuote: true,
      prettierTrailingComma: 'all',  // 'all' | 'es5' | 'none'
      prettierPrintWidth: 80,

      // ==== 16. Axios 调用风格 ========
      axiosStyle: 'config',        // 'config' → axios({}) | 'method' → axios.get/post()

      // ==== 17. 扩展配置（覆盖客户端默认配置）====
      extendConfig: '',            // JSON 字符串，如 '{"timeout":30000,"withCredentials":true}'

      // ==== 18. URL 改写规则 ====
      // 支持: [{ from: "inner", to: "priapi", flags: "g" }] 或 function(url) => newUrl
      urlRewriteRules: [],

      // ==== 19. 命名定制 ====
      uniqueName: false,           // 函数名强制唯一（追加递增后缀）
      nameCaseStyle: 'camelCase',  // 'camelCase' | 'PascalCase'
      sanitizeName: true,          // 自动剔除 : ; { } / 等特殊字符

      // ==== 20. 生成器类型 ====
      generatorType: 'builtin',    // 'builtin' | 'openapi-typescript'

      // ==== 21. 类型声明文件 ====
      dtsMode: false,              // 类型输出为 .d.ts 声明文件

      // ==== 22. 输出范围 ====
      outputScope: 'full',         // 'full' | 'typesOnly' | 'apiOnly' | 'mocksOnly'

      // ==== 24. Schema 严格校验 ====
      strictValidation: false,     // 开启更详细的 schema 结构校验

      // URL fetch
      urlFetchMethod: 'GET',
      urlFetchHeaders: '{}',
      urlFetchBody: '',
    };
  }

  setConfig(partial) {
    Object.assign(this.config, partial);
  }

  /* ======== 解析入口 ======== */
  parse(raw) {
    this.raw = raw;
    this._typeRegistry = {};
    this._generatedTypes = {};
    this._usedTypes = new Set();
    this._fnNames = [];
    this._issueLog = [];
    let obj;
    try { obj = JSON.parse(raw); }
    catch { throw new Error('JSON 解析失败，请检查输入是否为合法 JSON'); }

    if (obj.swagger === '2.0') {
      this.spec = this._normalizeV2(obj);
    } else if (obj.openapi && obj.openapi.startsWith('3.')) {
      this.spec = this._normalizeV3(obj);
    } else {
      throw new Error('无法识别 Swagger 版本，请提供 swagger: "2.0" 或 openapi: "3.x"');
    }

    // 构建 schema 注册表
    for (const [name, schema] of Object.entries(this.spec.schemas)) {
      this._typeRegistry[name] = schema;
    }
    return this.spec;
  }

  /* ======== Swagger 2.0 → 内部模型 ======== */
  _normalizeV2(obj) {
    const schemas = {};
    if (obj.definitions) {
      for (const [name, def] of Object.entries(obj.definitions)) {
        schemas[name] = this._v2SchemaToV3(def);
      }
    }
    const basePath = (obj.basePath || '').replace(/\/$/, '');
    const ops = [];
    for (const [path, pathItem] of Object.entries(obj.paths || {})) {
      const pathParams = (pathItem.parameters || []).map(p => this._normalizeParam(p));
      for (const method of ['get','post','put','delete','patch','options','head']) {
        const op = pathItem[method];
        if (!op) continue;
        const params = [...pathParams];
        let requestBody = null;
        for (const p of (op.parameters || [])) {
          if (p.in === 'body') {
            requestBody = { contentType: 'application/json', schema: this._v2SchemaToV3(p.schema), description: p.description || '', required: p.required !== false };
          } else if (p.in === 'formData') {
            // 收集所有 formData 参数，整体转为 requestBody
            // 避免重复：此处只负责标记，实际构建在下面统一处理
          } else {
            params.push(this._normalizeParam(p));
          }
        }
        // 处理 formData → requestBody（统一收集，避免与 body 参数冲突）
        if (!requestBody) {
          const fp = (op.parameters || []).filter(p => p.in === 'formData');
          if (fp.length > 0) {
            const props = {};
            const req = [];
            for (const f of fp) {
              props[f.name] = { type: f.type || 'string', description: f.description };
              if (f.required) req.push(f.name);
            }
            requestBody = {
              contentType: (op.consumes || obj.consumes || []).find(c => c.includes('form')) || 'multipart/form-data',
              schema: { type: 'object', properties: props, required: req.length > 0 ? req : undefined },
              description: 'formData parameters',
              required: fp.some(f => f.required),
            };
          }
        }
        const responses = {};
        for (const [code, resp] of Object.entries(op.responses || {})) {
          responses[code] = { description: resp.description || '', schema: resp.schema ? this._v2SchemaToV3(resp.schema) : null };
        }
        const tags = op.tags || (pathItem.tags) || ['default'];
        ops.push({
          operationId: op.operationId || this._deriveOperationId(method, path),
          method: method.toUpperCase(),
          path: path,
          fullPath: basePath + path,
          pathParams: params.filter(p => p.in === 'path'),
          queryParams: params.filter(p => p.in === 'query'),
          headerParams: params.filter(p => p.in === 'header'),
          cookieParams: params.filter(p => p.in === 'cookie'),
          requestBody,
          responses,
          tags,
          summary: op.summary || '',
          description: op.description || '',
          deprecated: !!op.deprecated,
          security: op.security || obj.security,
          consumes: op.consumes || obj.consumes || ['application/json'],
          produces: op.produces || obj.produces || ['application/json'],
        });
      }
    }
    return {
      version: '2.0',
      info: obj.info || { title: 'API', version: '1.0.0' },
      basePath,
      host: obj.host || '',
      schemes: obj.schemes || ['http'],
      operations: ops,
      schemas,
    };
  }

  _v2SchemaToV3(schema) {
    if (!schema) return { type: 'object' };
    if (schema.$ref) return { $ref: this._resolveRefName(schema.$ref) };
    const out = { ...schema };
    delete out.$ref;
    if (out.type === 'array' && out.items) {
      out.items = this._v2SchemaToV3(out.items);
    }
    if (out.properties) {
      const newProps = {};
      for (const [k, v] of Object.entries(out.properties)) {
        newProps[k] = this._v2SchemaToV3(v);
      }
      out.properties = newProps;
    }
    if (out.additionalProperties && typeof out.additionalProperties === 'object') {
      out.additionalProperties = this._v2SchemaToV3(out.additionalProperties);
    }
    // allOf
    if (out.allOf) { out.allOf = out.allOf.map(s => this._v2SchemaToV3(s)); }
    if (out.oneOf) { out.oneOf = out.oneOf.map(s => this._v2SchemaToV3(s)); }
    if (out.anyOf) { out.anyOf = out.anyOf.map(s => this._v2SchemaToV3(s)); }
    // nullable v2 extension
    if (out['x-nullable']) { out.nullable = true; }
    return out;
  }

  /* ======== OpenAPI 3.x → 内部模型 ======== */
  _normalizeV3(obj) {
    const schemas = {};
    if (obj.components && obj.components.schemas) {
      for (const [name, schema] of Object.entries(obj.components.schemas)) {
        schemas[name] = this._flattenSchema(schema);
      }
    }
    const basePath = this._getV3BasePath(obj);
    const ops = [];
    for (const [path, pathItem] of Object.entries(obj.paths || {})) {
      const pathParams = (pathItem.parameters || []).map(p => this._normalizeParam(p));
      for (const method of ['get','post','put','delete','patch','options','head']) {
        const op = pathItem[method];
        if (!op) continue;
        const params = [...pathParams, ...(op.parameters || []).map(p => this._normalizeParam(p))];
        let requestBody = null;
        if (op.requestBody) {
          const rb = op.requestBody;
          const ct = Object.keys(rb.content || {})[0] || 'application/json';
          requestBody = {
            contentType: ct,
            schema: this._flattenSchema((rb.content[ct] || {}).schema),
            description: rb.description || '',
            required: rb.required !== false,
          };
        }
        const responses = {};
        for (const [code, resp] of Object.entries(op.responses || {})) {
          const ct = Object.keys(resp.content || {})[0] || 'application/json';
          const rs = resp.content?.[ct]?.schema;
          responses[code] = { description: resp.description || '', schema: rs ? this._flattenSchema(rs) : null };
        }
        ops.push({
          operationId: op.operationId || this._deriveOperationId(method, path),
          method: method.toUpperCase(),
          path: path,
          fullPath: basePath + path,
          pathParams: params.filter(p => p.in === 'path'),
          queryParams: params.filter(p => p.in === 'query'),
          headerParams: params.filter(p => p.in === 'header'),
          cookieParams: params.filter(p => p.in === 'cookie'),
          requestBody,
          responses,
          tags: op.tags && op.tags.length ? op.tags : ['default'],
          summary: op.summary || '',
          description: op.description || '',
          deprecated: !!op.deprecated,
          security: op.security || obj.security,
        });
      }
    }
    return {
      version: (obj.openapi || '3.0.0').replace(/^(\d+\.\d+).*/, '$1'),
      info: obj.info || { title: 'API', version: '1.0.0' },
      basePath,
      servers: obj.servers || [],
      operations: ops,
      schemas,
    };
  }

  _getV3BasePath(obj) {
    if (obj.servers && obj.servers.length > 0) {
      try {
        const u = new URL(obj.servers[0].url, 'http://localhost');
        return u.pathname.replace(/\/$/, '');
      } catch { return ''; }
    }
    return '';
  }

  _flattenSchema(schema) {
    if (!schema) return { type: 'object' };
    if (schema.$ref) return { $ref: this._resolveRefName(schema.$ref) };
    const out = { ...schema };
    delete out.$ref;
    if (out.type === 'array' && out.items) {
      out.items = this._flattenSchema(out.items);
    }
    if (out.properties) {
      const np = {};
      for (const [k, v] of Object.entries(out.properties)) {
        np[k] = this._flattenSchema(v);
      }
      out.properties = np;
    }
    if (out.additionalProperties && typeof out.additionalProperties === 'object') {
      out.additionalProperties = this._flattenSchema(out.additionalProperties);
    }
    if (out.allOf) { out.allOf = out.allOf.map(s => this._flattenSchema(s)); }
    if (out.oneOf) { out.oneOf = out.oneOf.map(s => this._flattenSchema(s)); }
    if (out.anyOf) { out.anyOf = out.anyOf.map(s => this._flattenSchema(s)); }
    return out;
  }

  _normalizeParam(p) {
    return {
      name: p.name,
      in: p.in,
      required: p.required !== false && p.in === 'path' ? true : (p.required || false),
      description: p.description || '',
      schema: p.schema ? this._flattenSchema(p.schema) : (p.type ? { type: p.type } : { type: 'string' }),
      deprecated: !!p.deprecated,
      style: p.style,
      explode: p.explode,
    };
  }

  _resolveRefName(ref) {
    return ref.replace(/^#\/definitions\//, '').replace(/^#\/components\/schemas\//, '').replace(/\//g, '.');
  }

  _deriveOperationId(method, path) {
    const segs = path.replace(/^\/|\/$/g, '').split('/').filter(s => !s.startsWith('{'));
    const base = segs.length ? this._toPascal(segs[segs.length-1]) : 'Root';
    const prefix = method.toLowerCase() === 'get' ? 'get' :
                   method.toLowerCase() === 'post' ? 'create' :
                   method.toLowerCase() === 'put' ? 'update' :
                   method.toLowerCase() === 'delete' ? 'delete' : method.toLowerCase();
    return prefix + base;
  }

  /* ======== URL 改写 (Feature 18) ======== */
  _applyUrlRewrite(url) {
    const rules = this.config.urlRewriteRules;
    if (!rules || (Array.isArray(rules) && rules.length === 0)) return url;

    // 函数形式
    if (typeof rules === 'function') {
      return rules(url);
    }

    // 映射/正则替换列表
    if (Array.isArray(rules)) {
      let result = url;
      for (const rule of rules) {
        if (!rule) continue;
        // { from: 'inner', to: 'priapi', flags: 'g' } 或 { from: '/inner/g', to: 'priapi' }
        let pattern;
        let flags = rule.flags || 'g';
        if (this._isRegExp(rule.from)) {
          pattern = rule.from;
        } else if (typeof rule.from === 'string') {
          // 支持 "/pattern/flags" 简写形式
          const m = rule.from.match(/^\/(.+?)\/([gimsuy]*)$/);
          if (m) {
            pattern = new RegExp(m[1], m[2] || flags);
          } else {
            // 普通字符串：替换所有出现
            pattern = new RegExp(rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          }
        }
        if (pattern) {
          result = result.replace(pattern, rule.to || '');
        }
      }
      return result;
    }

    return url;
  }

  /* ======== 命名清理与大小写转换 (Feature 19) ======== */
  /**
   * 清理标识符，移除不安全字符，并转换为指定命名风格
   * @param {string} name 原始名称
   * @param {string} [caseStyle] 'camelCase' | 'PascalCase'，默认取 config.nameCaseStyle
   * @returns {string} 合法的 JS 标识符
   */
  _sanitizeName(name, caseStyle) {
    const cfg = this.config;
    const style = caseStyle || cfg.nameCaseStyle || 'camelCase';
    const doSanitize = cfg.sanitizeName !== false;

    if (!name) return style === 'PascalCase' ? 'Unknown' : 'unknown';

    let cleaned = name;

    if (doSanitize) {
      // 1. URL 路径参数占位符 → 移除花括号并保留内容
      cleaned = cleaned.replace(/[{}]/g, '');
      // 2. : → _（常见于路径中的冒号）
      cleaned = cleaned.replace(/[:]/g, '_');
      // 3. 斜杠 → 空（避免被误解析）
      cleaned = cleaned.replace(/[\/\\]/g, '');
      // 4. 中文字符 → 移除（或可保留，但通常 JS 标识符不用）
      cleaned = cleaned.replace(/[\u4e00-\u9fff]/g, '');
      // 5. 其他非标识符字符 → 替换为 _
      cleaned = cleaned.replace(/[^a-zA-Z0-9_$]/g, '_');
      // 6. 合并连续下划线
      cleaned = cleaned.replace(/_+/g, '_');
      // 7. 去除首尾下划线
      cleaned = cleaned.replace(/^_+|_+$/g, '');
      // 8. 空字符串兜底
      if (!cleaned) cleaned = 'unnamed';
    }

    // 转为驼峰：先按 _ 或 - 或空格分割
    const words = cleaned.split(/[_\-\s]+/).filter(Boolean);

    if (style === 'PascalCase') {
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    }

    // camelCase：首词小写，其余首字母大写
    return words.map((w, i) => {
      if (i === 0) return w.charAt(0).toLowerCase() + w.slice(1).toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join('');
  }

  /* ======== 校验 ======== */
  validate() {
    const issues = [];
    const spec = this.spec;
    if (!spec) return { valid: false, issues: [{ severity: 'error', path: '/', message: '请先解析 Swagger 规范' }] };

    // 检查 paths
    if (!spec.operations || spec.operations.length === 0) {
      issues.push({ severity: 'error', path: '/paths', message: '未找到任何 API 端点（paths 为空）' });
    }

    // 检查每个 operation
    for (const op of spec.operations) {
      // operationId
      if (!op.operationId || op.operationId === this._deriveOperationId(op.method, op.path)) {
        issues.push({ severity: 'warn', path: op.method + ' ' + op.path, message: '缺少 operationId，已自动生成: ' + op.operationId });
      }

      // 响应
      const respCodes = Object.keys(op.responses);
      if (respCodes.length === 0) {
        issues.push({ severity: 'warn', path: op.method + ' ' + op.path, message: '未定义任何响应（responses 为空）' });
      }
      if (!respCodes.includes('200') && !respCodes.includes('201') && !respCodes.some(c => c.startsWith('2'))) {
        issues.push({ severity: 'warn', path: op.method + ' ' + op.path, message: '未找到 2xx 成功响应' });
      }

      // path 参数是否在 path 中存在
      const pathSegs = op.path.match(/\{(\w+)\}/g) || [];
      const pathParamNames = op.pathParams.map(p => p.name);
      for (const seg of pathSegs) {
        const name = seg.replace(/[{}]/g, '');
        if (!pathParamNames.includes(name)) {
          issues.push({ severity: 'error', path: op.method + ' ' + op.path, message: `路径参数 {${name}} 未在 parameters 中定义` });
        }
      }

      // tags
      if (!op.tags || op.tags.length === 0 || (op.tags.length === 1 && op.tags[0] === 'default')) {
        issues.push({ severity: 'info', path: op.method + ' ' + op.path, message: '建议添加 tags 以支持按 Controller 分组' });
      }
    }

    // 检查 schema 引用完整性
    for (const op of spec.operations) {
      if (op.requestBody && op.requestBody.schema) {
        this._checkSchemaRefs(op.requestBody.schema, op.method + ' ' + op.path + ' requestBody', issues);
      }
      for (const [code, resp] of Object.entries(op.responses)) {
        if (resp.schema) {
          this._checkSchemaRefs(resp.schema, op.method + ' ' + op.path + ' response ' + code, issues);
        }
      }
      for (const p of [...op.pathParams, ...op.queryParams, ...op.headerParams]) {
        if (p.schema) {
          this._checkSchemaRefs(p.schema, op.method + ' ' + op.path + ' param ' + p.name, issues);
        }
      }
    }

    // Feature 24: 严格校验
    if (this.config.strictValidation) {
      this._strictValidate(spec, issues);
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  }

  /* ======== Feature 24: 严格校验 ======== */
  _strictValidate(spec, issues) {
    // 检查 definitions/schemas 中所有类型定义是否完整
    const schemas = spec.schemas || spec.definitions || {};
    for (const [name, schema] of Object.entries(schemas)) {
      this._validateSchemaDeep(name, schema, `#/definitions/${name}`, issues, new Set());
    }

    // 检查是否所有 operation 都有明确的 requestBody schema
    for (const op of spec.operations) {
      if (['post','put','patch'].includes(op.method.toLowerCase()) && !op.requestBody?.schema) {
        issues.push({ severity: 'warn', path: op.method + ' ' + op.path,
          message: `${op.method} 请求通常需要 requestBody，但未定义` });
      }
    }

    // 检查空类型定义
    for (const [name, schema] of Object.entries(schemas)) {
      if (schema.type === 'object' && !schema.properties && !schema.allOf && !schema.oneOf && !schema.anyOf) {
        issues.push({ severity: 'warn', path: `#/definitions/${name}`,
          message: `object 类型 "${name}" 未定义任何 properties，将成为空对象 {}` });
      }
    }

    // 检查响应中的 schema 引用
    for (const op of spec.operations) {
      for (const [code, resp] of Object.entries(op.responses)) {
        if (!resp.schema && code.startsWith('2')) {
          issues.push({ severity: 'info', path: `${op.method} ${op.path} response ${code}`,
            message: `2xx 响应未定义 schema，返回类型将变为 void` });
        }
      }
    }
  }

  _validateSchemaDeep(name, schema, path, issues, visited) {
    if (!schema || visited.has(schema)) return;
    if (schema.type === 'object' || schema.properties) return; // valid
    if (schema.$ref) return; // will be checked by ref checker
    if (schema.allOf || schema.oneOf || schema.anyOf) {
      const list = schema.allOf || schema.oneOf || schema.anyOf;
      list.forEach((s, i) => this._validateSchemaDeep(name, s, `${path}/composite[${i}]`, issues, visited));
      return;
    }
    if (schema.type === 'array') {
      if (!schema.items) {
        issues.push({ severity: 'warn', path,
          message: `array 类型 "${name}" 缺少 items 定义` });
      } else {
        this._validateSchemaDeep(name, schema.items, `${path}/items`, issues, visited);
      }
      return;
    }
    visited.add(schema);
  }

  _checkSchemaRefs(schema, context, issues) {
    if (schema.$ref) {
      const refName = schema.$ref;
      if (!this._typeRegistry[refName] && !this._typeRegistry[refName.replace(/^.*\./, '')]) {
        issues.push({ severity: 'error', path: context, message: `引用 "${schema.$ref}" 无法解析，在 definitions/schemas 中未找到` });
      }
    }
    if (schema.properties) {
      for (const v of Object.values(schema.properties)) this._checkSchemaRefs(v, context, issues);
    }
    if (schema.items) this._checkSchemaRefs(schema.items, context, issues);
    if (schema.allOf) schema.allOf.forEach(s => this._checkSchemaRefs(s, context, issues));
    if (schema.oneOf) schema.oneOf.forEach(s => this._checkSchemaRefs(s, context, issues));
    if (schema.anyOf) schema.anyOf.forEach(s => this._checkSchemaRefs(s, context, issues));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this._checkSchemaRefs(schema.additionalProperties, context, issues);
    }
  }

  /* ======== 高级过滤引擎 ======== */
  /**
   * 统一匹配器：支持字符串、正则、函数、以及命名空间约束
   * @param {string} item - 待匹配的字符串（tag 名或 path）
   * @param {*} filter - string | RegExp | Function | { pattern, namespace }
   * @param {object} context - 额外上下文 { op, controller }
   * @returns {boolean}
   */
  _matchesFilter(item, filter, context = {}) {
    if (!filter) return false;
    // 1. 函数形式：function(tag, op) => bool
    if (typeof filter === 'function') {
      return !!filter(item, context.op, context.controller);
    }
    // 2. RegExp 形式（跨 context 安全检测）
    if (this._isRegExp(filter)) {
      return filter.test(item);
    }
    // 3. 对象形式：{ pattern, namespace }
    if (typeof filter === 'object' && filter !== null && !Array.isArray(filter)) {
      const ns = filter.namespace;
      if (ns) {
        // 检查命名空间前缀
        const ctrl = context.controller || item;
        if (!ctrl.startsWith(ns) && !item.startsWith(ns)) return false;
      }
      const pat = filter.pattern;
      if (typeof pat === 'function') return !!pat(item, context.op, context.controller);
      if (this._isRegExp(pat)) return pat.test(item);
      if (typeof pat === 'string') {
        // 字符串模式：如果包含正则特征则按正则处理
        if (pat.startsWith('^') || pat.startsWith('\\') || (pat.startsWith('/') && pat.lastIndexOf('/') > 0)) {
          const reStr = pat.startsWith('/') && pat.lastIndexOf('/') > 0
            ? pat.slice(1, pat.lastIndexOf('/'))
            : pat;
          try { return new RegExp(reStr).test(item); } catch {}
        }
        return item === pat || this._matchGlob(item, pat);
      }
      return false;
    }
    // 4. 数组形式（多个 filter 的 AND 逻辑）
    if (Array.isArray(filter)) {
      return filter.every(f => this._matchesFilter(item, f, context));
    }
    // 5. 字符串形式：精确匹配 / glob 匹配 / 正则表达式字符串
    // 正则特征检测：以 ^ 开头 或 以 / 包裹
    if (typeof filter === 'string') {
      if (filter.startsWith('^') || (filter.startsWith('/') && filter.lastIndexOf('/') > 0)) {
        const reStr = filter.startsWith('/') && filter.lastIndexOf('/') > 0
          ? filter.slice(1, filter.lastIndexOf('/'))
          : filter;
        try { return new RegExp(reStr).test(item); } catch {}
      }
      return item === filter || this._matchGlob(item, filter);
    }
    return false;
  }

  /**
   * 跨 context 安全的 RegExp 检测（vm/iframe 等场景）
   */
  _isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
  }

  /**
   * 按名称空间获取关联操作的 controller 名。
   * controller 可以是 tag 的首个值，或路径首段。
   */
  _getControllerName(op) {
    return op.tags && op.tags.length > 0 && op.tags[0] !== 'default' ? op.tags[0] : this._getPathGroup(op.path);
  }

  filterOps() {
    const cfg = this.config;
    let ops = this.spec.operations;

    // ==== HTTP 方法过滤 ====
    const methods = cfg.filterMethods.length > 0 ? cfg.filterMethods : cfg.includeMethods;
    ops = ops.filter(op => methods.includes(op.method));

    // ==== Controller/Tag 过滤 ====
    const ctrlIncludes = cfg.controllerIncludes.length > 0 ? cfg.controllerIncludes : cfg.includeTags.map(t => ({ pattern: t }));
    if (ctrlIncludes.length > 0) {
      ops = ops.filter(op => {
        const ctrl = this._getControllerName(op);
        return op.tags.some(tag =>
          ctrlIncludes.some(f => this._matchesFilter(tag, f, { op, controller: ctrl }))
        );
      });
    }

    const ctrlExcludes = cfg.controllerExcludes.length > 0 ? cfg.controllerExcludes : cfg.excludeTags.map(t => ({ pattern: t }));
    if (ctrlExcludes.length > 0) {
      ops = ops.filter(op => {
        const ctrl = this._getControllerName(op);
        return !op.tags.some(tag =>
          ctrlExcludes.some(f => this._matchesFilter(tag, f, { op, controller: ctrl }))
        );
      });
    }

    // ==== Path 过滤 ====
    const pIncludes = cfg.pathIncludes.length > 0 ? cfg.pathIncludes : cfg.includePaths.map(p => ({ pattern: p }));
    if (pIncludes.length > 0) {
      ops = ops.filter(op => {
        const ctrl = this._getControllerName(op);
        return pIncludes.some(f => this._matchesFilter(op.path, f, { op, controller: ctrl }));
      });
    }

    const pExcludes = cfg.pathExcludes.length > 0 ? cfg.pathExcludes : cfg.excludePaths.map(p => ({ pattern: p }));
    if (pExcludes.length > 0) {
      ops = ops.filter(op => {
        const ctrl = this._getControllerName(op);
        return !pExcludes.some(f => this._matchesFilter(op.path, f, { op, controller: ctrl }));
      });
    }

    return ops;
  }

  _matchGlob(str, pattern) {
    const re = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$';
    return new RegExp(re).test(str);
  }

  /* ======== 主生成入口 ======== */
  generate() {
    if (!this.spec) throw new Error('请先调用 parse() 解析规范');
    const ops = this.filterOps();
    const cfg = this.config;

    // 重置
    this._generatedTypes = {};
    this._usedTypes = new Set();
    this._fnNames = [];

    // 1. 扫描所有用到的类型
    for (const op of ops) {
      if (op.requestBody && op.requestBody.schema) this._markUsedRefs(op.requestBody.schema);
      for (const resp of Object.values(op.responses)) {
        if (resp.schema) this._markUsedRefs(resp.schema);
      }
      for (const p of [...op.pathParams, ...op.queryParams, ...op.headerParams]) {
        if (p.schema) this._markUsedRefs(p.schema);
      }
    }

    // 2. 生成类型代码
    let typesCode = '';
    const scope = cfg.outputScope || 'full';
    if (cfg.generateTypes) {
      typesCode = this._generateTypes();
    }

    // 3. Feature 20: openapi-typescript 生成器
    if (cfg.generatorType === 'openapi-typescript') {
      return {
        files: [{
          name: '_OAT_GUIDE.txt',
          content: `请在终端运行：
npx openapi-typescript <your-swagger-url-or-file> \\
  --output ${cfg.typesFile || 'schema.d.ts'} \\
  --alphabetize \\
  --support-array-length \\
  --empty-objects-unknown

安装：npm i -D openapi-typescript
文档：https://openapi-ts.dev/cli`,
        }],
        operationCount: ops.length,
        typeCount: 0,
        note: 'openapi-typescript 需要在 Node.js 环境中运行',
      };
    }

    // 4. 生成 API 代码
    const files = [];
    const apiFunctions = this._generateAPIFunctions(ops);

    // Feature 21: dts 模式 — 类型文件后缀
    const typesExt = cfg.dtsMode ? '.d.ts' : '.ts';
    const typesFileName = cfg.dtsMode
      ? cfg.typesFile.replace(/\.ts$/, '.d.ts')
      : cfg.typesFile;

    if (cfg.outputMode === 'tree') {
      // 文件树模式
      // 3a. 类型文件
      if (cfg.generateTypes && (scope === 'full' || scope === 'typesOnly')) {
        files.push({ name: typesFileName, content: typesCode });
      }
      // 3b. HTTP 客户端文件（仅在 full/apiOnly 下生成）
      if (scope !== 'typesOnly' && scope !== 'mocksOnly') {
        const clientFile = cfg.httpClient === 'axios' ? 'http-client.ts' :
                           cfg.httpClient === 'fetch' ? 'http-client.ts' : cfg.customHttpModule.replace(/^.*\//, '');
        if (cfg.httpClient !== 'custom') {
          files.push({ name: clientFile, content: this._genHTTPClient() });
        }
      }
      // 3c. 按 tag 或 path 拆分 API（非 typesOnly 非 mocksOnly）
      if (scope !== 'typesOnly' && scope !== 'mocksOnly') {
        const groups = {};
        for (const fn of apiFunctions) {
          const key = cfg.splitBy === 'tag' ? (fn.tag || 'default') :
                      this._getPathGroup(fn.path);
          if (!groups[key]) groups[key] = [];
          groups[key].push(fn);
        }
        const clientFile = cfg.httpClient === 'axios' ? 'http-client.ts' :
                           cfg.httpClient === 'fetch' ? 'http-client.ts' : cfg.customHttpModule.replace(/^.*\//, '');
        for (const [key, fns] of Object.entries(groups)) {
          const fileName = this._makeFileName(key);
          files.push({ name: fileName, content: this._renderAPIFile(key, fns, fileName, clientFile) });
        }
        // 3d. index.ts 入口
        files.push({ name: 'index.ts', content: this._genIndex(files.filter(f => !f.name.startsWith('http-client')), clientFile) });
      }
      // 3e. Mock 文件（full 或 mocksOnly）
      if (cfg.generateMocks && (scope === 'full' || scope === 'mocksOnly')) {
        files.push({ name: cfg.mocksFile, content: this._genMocks(ops) });
      }
    } else {
      // 单文件模式
      const parts = [];
      const fileName = scope === 'typesOnly' ? typesFileName :
                       scope === 'mocksOnly' ? cfg.mocksFile : 'api.ts';
      if (cfg.generateTypes && (scope === 'full' || scope === 'typesOnly')) {
        parts.push(typesCode);
      }
      if (scope !== 'typesOnly' && scope !== 'mocksOnly') {
        parts.push(this._genHTTPClient());
        parts.push(apiFunctions.map(fn => fn.code).join('\n\n'));
      }
      if (cfg.generateMocks && (scope === 'full' || scope === 'mocksOnly')) {
        parts.push(this._genMocks(ops));
      }
      files.push({ name: fileName, content: parts.join('\n\n') });
    }

    return { files, operationCount: ops.length, typeCount: Object.keys(this._generatedTypes).length };
  }

  /* ======== 类型标记 ======== */
  _markUsedRefs(schema) {
    if (!schema) return;
    if (schema.$ref) {
      this._usedTypes.add(schema.$ref);
    }
    if (schema.properties) {
      for (const v of Object.values(schema.properties)) this._markUsedRefs(v);
    }
    if (schema.items) this._markUsedRefs(schema.items);
    if (schema.allOf) schema.allOf.forEach(s => this._markUsedRefs(s));
    if (schema.oneOf) schema.oneOf.forEach(s => this._markUsedRefs(s));
    if (schema.anyOf) schema.anyOf.forEach(s => this._markUsedRefs(s));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this._markUsedRefs(schema.additionalProperties);
    }
  }

  /* ======== 类型生成 ======== */
  _generateTypes() {
    const cfg = this.config;
    // 收集拓扑排序后的类型名
    const ordered = this._topoSortTypes();
    const lines = [];
    const header = [
      '// Auto-generated TypeScript types',
      `// Source: ${this.spec.info?.title || 'API'} v${this.spec.info?.version || '1.0.0'}`,
      '// DO NOT EDIT MANUALLY',
      '',
    ];
    lines.push(header.join('\n'));

    // 生成 ApiResponse 包装类型
    if (cfg.responseWrapper === 'standard') {
      lines.push(this._genStandardApiResponse());
    }

    for (const name of ordered) {
      if (cfg.filterUnusedTypes && !this._usedTypes.has(name)) continue;
      const schema = this._typeRegistry[name];
      if (!schema) continue;
      const tsType = this._schemaToTS(name, schema);
      this._generatedTypes[name] = tsType;
      lines.push(tsType);
    }
    return lines.join('\n\n');
  }

  _topoSortTypes() {
    const names = Object.keys(this._typeRegistry);
    const deps = {};
    for (const n of names) {
      deps[n] = this._findRefs(this._typeRegistry[n]);
    }
    const visited = new Set();
    const order = [];
    function visit(n) {
      if (visited.has(n)) return;
      visited.add(n);
      for (const d of (deps[n] || [])) {
        if (names.includes(d)) visit(d);
      }
      order.push(n);
    }
    for (const n of names) visit(n);
    return order;
  }

  _findRefs(schema) {
    const refs = [];
    if (schema.$ref) { refs.push(schema.$ref); }
    if (schema.properties) {
      for (const v of Object.values(schema.properties)) refs.push(...this._findRefs(v));
    }
    if (schema.items) refs.push(...this._findRefs(schema.items));
    if (schema.allOf) schema.allOf.forEach(s => refs.push(...this._findRefs(s)));
    if (schema.oneOf) schema.oneOf.forEach(s => refs.push(...this._findRefs(s)));
    if (schema.anyOf) schema.anyOf.forEach(s => refs.push(...this._findRefs(s)));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      refs.push(...this._findRefs(schema.additionalProperties));
    }
    return [...new Set(refs)];
  }

  _schemaToTS(name, schema) {
    const cfg = this.config;
    // $ref
    if (schema.$ref) {
      const refName = schema.$ref;
      this._usedTypes.add(refName);
      return `export type ${name} = ${refName};`;
    }
    // enum
    if (schema.enum) {
      if (cfg.enumStyle === 'enum') {
        const vals = schema.enum.map(v => typeof v === 'string' ? `'${v}'` : String(v)).join(', ');
        return `export enum ${name} { ${schema.enum.join(', ')} }`;
      } else {
        const vals = schema.enum.map(v => typeof v === 'string' ? `'${v}'` : String(v)).join(' | ');
        return `export type ${name} = ${vals};`;
      }
    }
    // oneOf
    if (schema.oneOf) {
      const ts = schema.oneOf.map(s => this._schemaToTSType(s)).join(' | ');
      return `export type ${name} = ${ts};`;
    }
    // anyOf
    if (schema.anyOf) {
      const ts = schema.anyOf.map(s => this._schemaToTSType(s)).join(' & Partial<').replace(/^/, 'Partial<') + '>';
      return `export type ${name} = ${ts};`;
    }
    // allOf
    if (schema.allOf) {
      const extendsTypes = schema.allOf.filter(s => s.$ref).map(s => s.$ref).join(', ');
      const inlineSchemas = schema.allOf.filter(s => !s.$ref);
      if (inlineSchemas.length === 0) {
        const ts = schema.allOf.map(s => this._schemaToTSType(s, true)).join(' & ');
        return `export type ${name} = ${ts};`;
      }
      // merge all inline props
      const merged = this._mergeAllOfProps(inlineSchemas);
      let content = '';
      if (merged.properties && Object.keys(merged.properties).length > 0) {
        content = this._propertiesToTS(merged.properties, merged.required);
      }
      const extendPart = extendsTypes ? ` extends ${extendsTypes}` : '';
      return `export interface ${name}${extendPart} {\n${content}\n}`;
    }
    // array
    if (schema.type === 'array') {
      const itemType = schema.items ? this._schemaToTSType(schema.items) : 'unknown';
      return `export type ${name} = ${itemType}[];`;
    }
    // object
    if (schema.type === 'object' || schema.properties) {
      const props = schema.properties || {};
      const required = schema.required || [];
      const hasAdditional = schema.additionalProperties && typeof schema.additionalProperties === 'object';
      let indent = '  ';
      const propLines = [];
      for (const [propName, propSchema] of Object.entries(props)) {
        const isRequired = required.includes(propName);
        const optional = schema.requiredPhase === false ? true : (propSchema.nullable ? '?' : (!isRequired ? '?' : ''));
        const tsType = this._schemaToTSType(propSchema);
        propLines.push(`${indent}${propName}${optional}: ${tsType};`);
      }
      if (hasAdditional) {
        const addType = this._schemaToTSType(schema.additionalProperties);
        propLines.push(`${indent}[key: string]: ${addType};`);
      }
      return `export interface ${name} {\n${propLines.join('\n')}\n}`;
    }
    // primitives
    const ts = this._primitiveToTS(schema);
    return `export type ${name} = ${ts};`;
  }

  _schemaToTSType(schema, skipOptional) {
    if (!schema) return 'unknown';
    if (schema.$ref) {
      this._usedTypes.add(schema.$ref);
      return schema.$ref;
    }
    if (schema.enum) {
      return schema.enum.map(v => typeof v === 'string' ? `'${v}'` : String(v)).join(' | ');
    }
    if (schema.oneOf) {
      return schema.oneOf.map(s => this._schemaToTSType(s)).join(' | ');
    }
    if (schema.anyOf) {
      return schema.anyOf.map(s => this._schemaToTSType(s)).join(' & ');
    }
    if (schema.allOf) {
      const parts = schema.allOf.map(s => this._schemaToTSType(s));
      return parts.join(' & ');
    }
    if (schema.type === 'array') {
      const itemType = schema.items ? this._schemaToTSType(schema.items) : 'unknown';
      return `${itemType}[]`;
    }
    if (schema.type === 'object' || schema.properties) {
      const props = schema.properties || {};
      const required = schema.required || [];
      const propLines = [];
      for (const [k, v] of Object.entries(props)) {
        const isRequired = required.includes(k);
        const opt = (skipOptional) ? '' : (!isRequired ? '?' : '');
        const tsType = this._schemaToTSType(v);
        propLines.push(`${k}${opt}: ${tsType}`);
      }
      const add = schema.additionalProperties && typeof schema.additionalProperties === 'object'
        ? `[key: string]: ${this._schemaToTSType(schema.additionalProperties)}; ` : '';
      return `{ ${add}${propLines.join('; ')} }`;
    }
    return this._primitiveToTS(schema);
  }

  _primitiveToTS(schema) {
    if (schema.nullable) return this._mapType(schema.type) + ' | null';
    return this._mapType(schema.type);
  }

  _mapType(type) {
    const map = {
      string: 'string', integer: 'number', number: 'number',
      boolean: 'boolean', array: 'unknown[]', object: 'Record<string, unknown>',
      null: 'null',
    };
    return map[type] || 'unknown';
  }

  _propertiesToTS(properties, required) {
    const lines = [];
    for (const [k, v] of Object.entries(properties)) {
      const isReq = Array.isArray(required) && required.includes(k);
      const opt = isReq ? '' : '?';
      lines.push(`  ${k}${opt}: ${this._schemaToTSType(v)}`);
    }
    return lines.join('\n');
  }

  _mergeAllOfProps(schemas) {
    const merged = { properties: {}, required: [] };
    for (const s of schemas) {
      if (s.properties) { Object.assign(merged.properties, s.properties); }
      if (s.required) { merged.required = [...new Set([...merged.required, ...s.required])]; }
    }
    return merged;
  }

  _genStandardApiResponse() {
    return `export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}`;
  }

  /* ======== API 函数生成 ======== */
  _generateAPIFunctions(ops) {
    const cfg = this.config;
    const functions = [];
    const nameCount = {};

    for (const op of ops) {
      let fnName = this._makeFunctionName(op);
      // Feature 19: uniqueName — 重名时追加递增后缀
      if (cfg.uniqueName) {
        if (nameCount[fnName]) {
          nameCount[fnName]++;
          fnName = fnName + nameCount[fnName];
        } else {
          nameCount[fnName] = 1;
        }
      }
      this._fnNames.push(fnName);

      const tag = op.tags[0] || 'default';
      const code = this._genSingleFunction(op, fnName, cfg);
      functions.push({ name: fnName, code, tag, path: op.path, method: op.method, operation: op });
    }
    return functions;
  }

  _makeFunctionName(op) {
    const cfg = this.config;
    let name;

    if (cfg.functionNaming === 'operationId') {
      name = op.operationId || this._deriveOperationId(op.method, op.path);
    } else if (cfg.functionNaming === 'custom') {
      name = cfg.functionNameTemplate;
      name = name.replace(/\{method\}/g, this._capitalize(op.method.toLowerCase()));
      name = name.replace(/\{Method\}/g, op.method.charAt(0) + op.method.slice(1).toLowerCase());
      name = name.replace(/\{METHOD\}/g, op.method.toUpperCase());
      name = name.replace(/\{path\}/g, this._pathToPascal(op.path));
      name = name.replace(/\{tag\}/g, this._toPascal(op.tags[0] || 'default'));
      name = name.replace(/\{operationId\}/g, op.operationId || '');
      name = name.replace(/\{summary\}/g, this._toPascal(op.summary || ''));
    } else {
      // default: path-based
      name = this._deriveOperationId(op.method, op.path);
    }

    // Feature 19: 命名清理 + 大小写风格
    name = this._sanitizeName(name);
    // 追加后缀
    if (cfg.funNameSuffix) name += cfg.funNameSuffix;
    return name || 'apiCall';
  }

  _makeFileName(key) {
    const cfg = this.config;
    let name = cfg.fileNameTemplate;
    name = name.replace(/\{tag\}/g, key);
    name = name.replace(/\{controller\}/g, key);
    // Feature 19: 文件名也应用清理规则（kebab 风格）
    const safe = this._toKebab(this._sanitizeName(key, 'camelCase'));
    return name.includes('{') ? safe + '.ts' : (name.endsWith('.ts') ? name : name + '.ts');
  }

  /* ======== JSDoc 注释生成 ======== */
  /**
   * 生成丰富的 JSDoc 块
   * @param {object} op - 规范化后的操作对象
   * @param {string} fnName - 函数名
   * @param {string} returnType - 返回类型
   * @returns {string} JSDoc 注释字符串（可能为空）
   */
  _renderJSDoc(op, fnName, returnType, displayPath) {
    const pathToShow = displayPath || op.path;
    const lines = [];

    // 摘要 / 描述
    const summary = op.summary || '';
    const desc = (op.description && op.description !== op.summary) ? op.description : '';

    if (summary || desc) {
      lines.push('/**');
      if (summary) lines.push(` * ${summary}`);
      if (desc) {
        lines.push(` *`);
        lines.push(` * ${desc}`);
      }
    } else {
      lines.push('/**');
      lines.push(` * ${op.method} ${pathToShow}`);
    }

    // HTTP 方法 & Content-Type
    const ct = this._getOperationContentType(op);
    lines.push(` * @http ${op.method} ${pathToShow}`);
    lines.push(` * @contentType ${ct}`);

    // @param 文档
    for (const p of op.pathParams) {
      const typeHint = this._schemaToTSType(p.schema);
      lines.push(` * @param {${typeHint}} ${p.name} - ${p.description || `path parameter ${p.name}`}${p.required ? ' (required)' : ''}`);
    }
    for (const p of op.queryParams) {
      const typeHint = this._schemaToTSType(p.schema);
      lines.push(` * @param {${typeHint}} ${p.name} - ${p.description || `query parameter ${p.name}`}${p.required ? ' (required)' : ''}`);
    }
    if (op.headerParams.length > 0) {
      lines.push(` * @param {object} headers - 自定义请求头`);
    }
    if (op.requestBody?.schema) {
      const bodyTypeName = this._schemaToTSType(op.requestBody.schema);
      const req = op.requestBody.required !== false ? ' (required)' : '';
      lines.push(` * @param {${bodyTypeName}} body - ${op.requestBody.description || 'request body'}${req}`);
    }

    // @returns
    lines.push(` * @returns {Promise<${returnType}>} ${op.summary ? '返回' + op.summary : ''}`);

    // operationId / tags
    if (op.operationId) lines.push(` * @operationId ${op.operationId}`);
    if (op.tags.length > 0) lines.push(` * @tags ${op.tags.join(', ')}`);

    lines.push(' */');
    return lines.join('\n');
  }

  /* ======== 从 Schema 解析字段类型 ======== */
  /**
   * 从 schema 中按字段名解析子 schema，用于 returnKey 链式提取
   */
  _resolveFieldSchema(schema, fieldName) {
    if (!schema) return null;

    // $ref 解析
    if (schema.$ref) {
      const refName = this._resolveRefName(schema.$ref);
      const resolved = this._typeRegistry[refName];
      if (resolved && resolved !== schema) {
        return this._resolveFieldSchema(resolved, fieldName);
      }
      // 尝试从 spec.schemas 查找
      if (this.spec?.schemas?.[refName]) {
        return this._resolveFieldSchema(this.spec.schemas[refName], fieldName);
      }
      return null;
    }

    // 对象：取 properties
    if (schema.properties && schema.properties[fieldName]) {
      return schema.properties[fieldName];
    }

    // array: 取 items
    if (schema.type === 'array' && schema.items) {
      return this._resolveFieldSchema(schema.items, fieldName);
    }

    return null;
  }

  _genSingleFunction(op, fnName, cfg) {
    const lines = [];
    const hasBody = op.requestBody && op.requestBody.schema;
    const hasQuery = op.queryParams.length > 0;
    const hasPath = op.pathParams.length > 0;
    const hasHeaders = op.headerParams.length > 0;

    // 参数列表
    const paramList = [];
    // path params
    for (const p of op.pathParams) {
      let tsType = this._schemaToTSType(p.schema);
      if (!p.required) tsType += ' | undefined';
      paramList.push(`${p.name}: ${tsType}`);
    }
    // query params → 合并为单个 Params 对象
    if (hasQuery) {
      const qTypeName = fnName + 'Params';
      const qProps = [];
      for (const p of op.queryParams) {
        qProps.push(`  ${p.name}${p.required ? '' : '?'}: ${this._schemaToTSType(p.schema)};`);
      }
      const qType = `// ${qTypeName}\ntype ${qTypeName} = {\n${qProps.join('\n')}\n};`;
      lines.push(qType);
      paramList.push(`params${cfg.requestBodyOptional ? '?' : ''}: ${qTypeName}`);
    }
    // headers
    if (hasHeaders) {
      const hTypeName = fnName + 'Headers';
      const hProps = [];
      for (const p of op.headerParams) {
        hProps.push(`  ${p.name}${p.required ? '' : '?'}: ${this._schemaToTSType(p.schema)};`);
      }
      lines.push(`type ${hTypeName} = {\n${hProps.join('\n')}\n};`);
      paramList.push(`headers?: ${hTypeName}`);
    }
    // body
    if (hasBody) {
      const bodyType = this._schemaToTSType(op.requestBody.schema);
      const opt = op.requestBody.required === false || cfg.requestBodyOptional ? '?' : '';
      paramList.push(`body${opt}: ${bodyType}`);
    }

    // 响应类型 + returnKey 提取
    const resp200 = op.responses['200'] || op.responses['201'] || Object.values(op.responses).find(r => r.schema);
    let responseType = 'void';
    if (resp200 && resp200.schema) {
      responseType = this._schemaToTSType(resp200.schema);
    }
    // returnKey: 从响应体中按字段路径提取
    let effectiveType = responseType;   // 函数实际返回的类型
    let returnKeyPath = null;            // 用于函数体中提取的路径
    if (cfg.returnKey && responseType !== 'void') {
      const keys = cfg.returnKey.split('.');
      let schema = resp200?.schema;
      let typeName = responseType;
      let extracted = true;
      for (const key of keys) {
        const field = schema && this._resolveFieldSchema(schema, key);
        if (field) {
          schema = field;
          typeName = this._schemaToTSType(field);
        } else {
          extracted = false;
          break;
        }
      }
      if (extracted && typeName !== responseType) {
        effectiveType = typeName;
        returnKeyPath = cfg.returnKey;
      }
    }

    // 包装返回值
    let returnType = effectiveType;
    if (cfg.responseWrapper === 'standard') {
      returnType = `ApiResponse<${effectiveType}>`;
    } else if (cfg.responseWrapper === 'custom') {
      const wrapType = cfg.responseWrapperType;
      if (wrapType.includes('<T>')) {
        returnType = wrapType.replace('<T>', `<${effectiveType}>`);
      } else {
        returnType = wrapType;
      }
    }

    // 构建 URL（apiPrefix + contentPath + rewritten path）
    let urlPrefix = '';
    if (cfg.apiPrefix) {
      urlPrefix = cfg.apiPrefix.endsWith('/') ? cfg.apiPrefix.slice(0, -1) : cfg.apiPrefix;
    }
    if (cfg.contentPath) {
      const cp = cfg.contentPath.startsWith('/') ? cfg.contentPath : '/' + cfg.contentPath;
      urlPrefix += cp.endsWith('/') ? cp.slice(0, -1) : cp;
    }
    // Feature 18: URL 改写 — 提前计算以便 JSDoc 也能使用
    const rewrittenPath = this._applyUrlRewrite(op.path);
    let urlExpr = '`' + urlPrefix + rewrittenPath.replace(/\{(\w+)\}/g, '$${$1}') + '`';

    // JSDoc — 在 returnType 确定后生成，传入改写后的路径
    const jsdoc = this._renderJSDoc(op, fnName, returnType, rewrittenPath);
    if (jsdoc) lines.unshift(...jsdoc.split('\n'));

    // 函数体
    const paramsStr = paramList.join(', ');
    const funcStyle = cfg.functionStyle;

    let funcDef;
    if (funcStyle === 'arrow') {
      funcDef = `export const ${fnName} = async (${paramsStr}): Promise<${returnType}> => {`;
    } else if (funcStyle === 'const') {
      funcDef = `export const ${fnName} = async (${paramsStr}): Promise<${returnType}> => {`;
    } else {
      funcDef = `export async function ${fnName}(${paramsStr}): Promise<${returnType}> {`;
    }

    const bodyCode = this._genFunctionBody(op, fnName, hasQuery, hasBody, hasHeaders, urlExpr, responseType, cfg, returnKeyPath);
    lines.push(funcDef);
    lines.push(bodyCode);
    lines.push('}');
    return lines.join('\n');
  }

  _genFunctionBody(op, fnName, hasQuery, hasBody, hasHeaders, urlExpr, rawResponseType, cfg, returnKeyPath) {
    const method = op.method.toLowerCase();
    const indent = '  ';
    const lines = [];

    // 辅助：根据 returnKey 生成响应提取代码
    const wrapReturn = (responseExpr) => {
      if (returnKeyPath) {
        const keys = returnKeyPath.split('.');
        return keys.reduce((expr, key) => `${expr}.${key}`, responseExpr);
      }
      return responseExpr;
    };

    if (cfg.httpClient === 'axios') {
      const libName = cfg.httpLibraryName || 'httpClient';
      const methodLower = method.toLowerCase();

      if (cfg.axiosStyle === 'method') {
        // Feature 16: axios.get(url, config) / axios.post(url, data, config) 风格
        const configItems = [];
        let dataArg = null;

        if (hasQuery) configItems.push('params');
        let headersArg = hasHeaders ? 'headers' : '{}';
        const contentType = this._getOperationContentType(op);
        if (hasBody) {
          if (contentType.includes('json')) {
            headersArg = hasHeaders ? `{ 'Content-Type': 'application/json', ...headers }` : `{ 'Content-Type': 'application/json' }`;
          } else if (contentType.includes('form')) {
            headersArg = hasHeaders ? `{ 'Content-Type': 'multipart/form-data', ...headers }` : `{ 'Content-Type': 'multipart/form-data' }`;
          } else {
            headersArg = hasHeaders ? `{ 'Content-Type': '${contentType}', ...headers }` : `{ 'Content-Type': '${contentType}' }`;
          }
        }
        configItems.push(`headers: ${headersArg}`);

        const configBody = configItems.join(',\n' + indent + '  ');

        // post/put/patch 有 body 作为第二个参数
        if (['post', 'put', 'patch'].includes(methodLower) && hasBody) {
          lines.push(`${indent}const response = await ${libName}.${methodLower}<${rawResponseType}>(${urlExpr}, body, {`);
          lines.push(`${indent}  ${configBody}`);
          lines.push(`${indent}});`);
        } else {
          // get/delete/head/options: body 可能放在 config.data 中
          if (hasBody) {
            lines.push(`${indent}const response = await ${libName}.${methodLower}<${rawResponseType}>(${urlExpr}, {`);
            lines.push(`${indent}  ${configBody},`);
            lines.push(`${indent}  data: body`);
            lines.push(`${indent}});`);
          } else {
            lines.push(`${indent}const response = await ${libName}.${methodLower}<${rawResponseType}>(${urlExpr}, {`);
            lines.push(`${indent}  ${configBody}`);
            lines.push(`${indent}});`);
          }
        }
      } else {
        // 默认：axios({ method, url, ... }) config 对象风格
        const configItems = [`method: '${method}'`, `url: ${urlExpr}`];
        if (hasQuery || op.queryParams.length > 0) configItems.push('params');
        let headersArg = hasHeaders ? 'headers' : '{}';
        const contentType = this._getOperationContentType(op);
        if (hasBody) {
          if (contentType.includes('json')) {
            headersArg = hasHeaders ? `{ 'Content-Type': 'application/json', ...headers }` : `{ 'Content-Type': 'application/json' }`;
          } else if (contentType.includes('form')) {
            headersArg = hasHeaders ? `{ 'Content-Type': 'multipart/form-data', ...headers }` : `{ 'Content-Type': 'multipart/form-data' }`;
          } else {
            headersArg = hasHeaders ? `{ 'Content-Type': '${contentType}', ...headers }` : `{ 'Content-Type': '${contentType}' }`;
          }
        }
        configItems.push(`headers: ${headersArg}`);
        if (hasBody) configItems.push('data: body');
        lines.push(`${indent}const response = await ${libName}.request<${rawResponseType}>({`);
        lines.push(`${indent}  ${configItems.join(',\n' + indent + '  ')}`);
        lines.push(`${indent}});`);
      }

      if (cfg.responseWrapper === 'standard') {
        lines.push(`${indent}return ${wrapReturn('response.data')};`);
      } else {
        lines.push(`${indent}return ${wrapReturn('response.data')};`);
      }
    } else if (cfg.httpClient === 'fetch') {
      // fetch
      const ct = this._getOperationContentType(op);
      let opts = `method: '${method}', headers: { 'Content-Type': '${ct}'`;
      if (hasHeaders) opts += `, ...headers`;
      opts += ' }';
      if (hasBody) {
        if (ct.includes('json')) {
          opts += `, body: JSON.stringify(body)`;
        } else if (ct.includes('form')) {
          // For form-data, body is assumed to be FormData or URLSearchParams
          opts += `, body`;
        } else {
          opts += `, body: JSON.stringify(body)`;
        }
      }
      let fullUrl = urlExpr;
      if (hasQuery) fullUrl += ' + (params ? \'?\' + new URLSearchParams(params).toString() : \'\')';
      lines.push(`${indent}const response = await fetch(${fullUrl}, { ${opts} });`);
      if (cfg.responseWrapper === 'standard') {
        lines.push(`${indent}const json = await response.json();`);
        lines.push(`${indent}return ${wrapReturn('json')};`);
      } else if (rawResponseType !== 'void') {
        lines.push(`${indent}const json = await response.json();`);
        lines.push(`${indent}return ${wrapReturn('json')};`);
      }
      if (rawResponseType === 'void' && cfg.responseWrapper !== 'standard') {
        lines.push(`${indent}return;`);
      }
    } else {
      // custom HTTP client
      const ct = this._getOperationContentType(op);
      let fullUrl = urlExpr;
      if (hasQuery) fullUrl += ' + (params ? \'?\' + new URLSearchParams(params as Record<string, string>).toString() : \'\')';
      let retType = rawResponseType;
      if (cfg.responseWrapper === 'standard') retType = `ApiResponse<${rawResponseType}>`;
      else if (cfg.responseWrapper === 'custom') {
        retType = cfg.responseWrapperType.includes('<T>')
          ? cfg.responseWrapperType.replace('<T>', `<${rawResponseType}>`)
          : cfg.responseWrapperType;
      }
      lines.push(`${indent}return ${cfg.httpLibraryName || 'request'}<${retType}>({`);
      lines.push(`${indent}  url: ${fullUrl},`);
      lines.push(`${indent}  method: '${method}',`);
      if (hasHeaders) lines.push(`${indent}  headers,`);
      if (hasBody) {
        lines.push(`${indent}  data: body,`);
        lines.push(`${indent}  headers: { 'Content-Type': '${ct}', ...headers },`);
      }
      lines.push(`${indent}});`);
    }

    return lines.join('\n');
  }

  /* ======== HTTP 客户端代码 ======== */
  _genHTTPClient() {
    const cfg = this.config;
    const libName = cfg.httpLibraryName || cfg.httpClient;

    // Feature 17: extendConfig — 解析额外配置
    let extendConfig = {};
    if (cfg.extendConfig && typeof cfg.extendConfig === 'string') {
      try { extendConfig = JSON.parse(cfg.extendConfig); } catch (e) { /* ignore invalid JSON */ }
    } else if (typeof cfg.extendConfig === 'object') {
      extendConfig = cfg.extendConfig;
    }

    if (cfg.httpClient === 'axios') {
      const configLines = [];
      if (cfg.baseURL) configLines.push(`  baseURL: '${cfg.baseURL}',`);
      // 默认 timeout，除非 extendConfig 中覆盖
      if (extendConfig.timeout === undefined) {
        configLines.push('  timeout: 10000,');
      }
      // 合并 extendConfig 中的其他字段
      for (const [k, v] of Object.entries(extendConfig)) {
        const val = typeof v === 'string' ? `'${v}'` : JSON.stringify(v);
        configLines.push(`  ${k}: ${val},`);
      }
      const configStr = configLines.join('\n');
      return `// Auto-generated HTTP client wrapper
import axios, { type AxiosInstance } from 'axios';

const ${libName}: AxiosInstance = axios.create({
${configStr}
});

// 请求拦截器
${libName}.interceptors.request.use((config) => {
  return config;
});

// 响应拦截器
${libName}.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export { ${libName} };
export default ${libName};`;
    }
    if (cfg.httpClient === 'fetch') {
      return `// Auto-generated HTTP client wrapper
const BASE_URL = '${cfg.baseURL || ''}';

// Custom fetch wrapper - replace with your own request library
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : \`\${BASE_URL}\${url}\`;
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }
  return response.json();
}

export { request };`;
    }
    // custom
    const modPath = cfg.customHttpModule || '@/utils/request';
    return `// Using custom HTTP client
import request from '${modPath}';
// Replace the above import with your own request library
// Expected signature: request<T>(config: { url, method, data?, params?, headers? }): Promise<T>

export { request };`;
  }

  _genIndex(files, clientFile) {
    const exports = [];
    for (const f of files) {
      const mod = f.name.replace('.ts', '');
      if (mod === 'types' || mod === 'mocks') continue;
      exports.push(`export * from './${mod}';`);
    }
    if (this.config.generateTypes) {
      exports.unshift(`export * from './${this.config.typesFile.replace('.ts', '')}';`);
    }
    return '// Auto-generated barrel export\n' + exports.join('\n') + '\n';
  }

  _renderAPIFile(tag, functions, fileName, clientFile) {
    const cfg = this.config;
    const lines = [];

    // leadingCode: 文件头注入代码（如 eslint-disable, 自定义注释等）
    if (cfg.leadingCode) {
      lines.push(cfg.leadingCode);
      lines.push('');
    }

    lines.push(`// ${tag} API`);
    lines.push(`// Auto-generated functions for controller: ${tag}`);
    lines.push('');

    // imports — 使用 httpLibraryName
    const libName = cfg.httpLibraryName || cfg.httpClient;
    if (cfg.httpClient === 'axios') {
      lines.push(`import ${libName} from './http-client';`);
    } else if (cfg.httpClient === 'fetch') {
      lines.push(`import { request as ${libName} } from './http-client';`);
    } else {
      const mod = cfg.customHttpModule ? cfg.customHttpModule.replace(/^.*\//, '').replace('.ts', '').replace('.js', '') : 'request';
      lines.push(`import ${libName} from '${cfg.customHttpModule}';`);
    }

    if (cfg.generateTypes) {
      const typesMod = cfg.typesFile.replace('.ts', '');
      const usedTypeNames = this._getUsedTypeNamesForTag(tag);
      // Also include ApiResponse wrapper type if used
      if (cfg.responseWrapper === 'standard' && !usedTypeNames.includes('ApiResponse')) {
        usedTypeNames.push('ApiResponse');
      }
      if (usedTypeNames.length > 0) {
        lines.push(`import type { ${usedTypeNames.join(', ')} } from './${typesMod}';`);
      }
    }

    lines.push('');
    for (const fn of functions) {
      lines.push(fn.code);
      lines.push('');
    }
    return lines.join('\n');
  }

  _getUsedTypeNamesForTag(tag) {
    // return all used types
    return [...this._usedTypes];
  }

  /* ======== Mock 生成 ======== */
  _genMocks(ops) {
    const cfg = this.config;
    const mockEngine = cfg.mockEngine || 'builtin';
    const lines = [];

    if (mockEngine === 'mockjs') {
      return this._genMockjsMocks(ops);
    }

    lines.push('// Auto-generated mock data');
    lines.push('// Based on OpenAPI schemas');
    lines.push('');

    if (mockEngine === 'heuristic') {
      lines.push('// Using heuristic mock generation — realistic values based on field names');
      lines.push('');
    }

    lines.push('export const mocks = {');
    for (const op of ops) {
      const fnName = this._fnNames.find(n => n === this._toCamel(this._deriveOperationId(op.method, op.path))) ||
                     this._fnNames[ops.indexOf(op)] || this._toCamel(this._deriveOperationId(op.method, op.path));

      // response mock
      const resp200 = op.responses['200'] || op.responses['201'] || Object.values(op.responses).find(r => r.schema);
      if (resp200 && resp200.schema) {
        const mockVal = mockEngine === 'heuristic'
          ? this._genHeuristicMock(resp200.schema)
          : this._genMockValue(resp200.schema);
        lines.push(`  ['${op.method} ${op.path}']: ${JSON.stringify(mockVal, null, 2).replace(/^/mg, '  ')},`);
      }
    }
    lines.push('};');
    lines.push('');

    // mock handler (useful for MSW or manual mocking)
    lines.push('// Mock handler - map requests to mock responses');
    lines.push('export function getMockResponse(method: string, path: string) {');
    lines.push('  const key = `${method} ${path}`;');
    lines.push('  if (key in mocks) {');
    lines.push('    return Promise.resolve({ code: 0, data: (mocks as any)[key], message: "ok" });');
    lines.push('  }');
    lines.push('  return Promise.reject(new Error(`No mock for ${key}`));');
    lines.push('}');

    return lines.join('\n');
  }

  /* ======== Feature 23: MockJS 模板生成 ======== */
  _genMockjsMocks(ops) {
    const lines = [];
    lines.push('// Auto-generated Mock.js mock data');
    lines.push('// Run: npm install mockjs @types/mockjs');
    lines.push("import Mock from 'mockjs';");
    lines.push('');
    lines.push('// Mock template definitions');
    lines.push('export const mockTemplates: Record<string, any> = {');

    for (const op of ops) {
      const resp200 = op.responses['200'] || op.responses['201'] || Object.values(op.responses).find(r => r.schema);
      if (resp200 && resp200.schema) {
        const template = this._genMockjsTemplate(resp200.schema);
        lines.push(`  ['${op.method} ${op.path}']: ${JSON.stringify(template, null, 2)},`);
      }
    }

    lines.push('};');
    lines.push('');
    lines.push('// Generate mock data using Mock.js');
    lines.push('export function generateMock(method: string, path: string) {');
    lines.push('  const template = mockTemplates[`${method} ${path}`];');
    lines.push('  if (template) {');
    lines.push('    return Mock.mock(template);');
    lines.push('  }');
    lines.push('  return null;');
    lines.push('}');
    lines.push('');
    lines.push("// Setup MSW-style mock handler");
    lines.push("Mock.setup({ timeout: '200-400' });");

    return lines.join('\n');
  }

  _genMockjsTemplate(schema) {
    if (schema.$ref) {
      const resolved = this._typeRegistry[schema.$ref];
      return resolved ? this._genMockjsTemplate(resolved) : {};
    }
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum) return schema.enum[0];
    if (schema.oneOf) return this._genMockjsTemplate(schema.oneOf[0]);
    if (schema.anyOf) return this._genMockjsTemplate(schema.anyOf[0]);
    if (schema.allOf) {
      const merged = {};
      for (const s of schema.allOf) Object.assign(merged, this._genMockjsTemplate(s));
      return merged;
    }
    if (schema.type === 'array') {
      const item = schema.items ? this._genMockjsTemplate(schema.items) : '@string';
      return [item, item, item];
    }
    if (schema.type === 'object' || schema.properties) {
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties || {})) obj[k] = this._genMockjsTemplate(v);
      return obj;
    }
    return this._mockjsPrimitive(schema.type);
  }

  _mockjsPrimitive(type) {
    const map = {
      string: '@string', integer: '@integer(0, 1000)', number: '@float(0, 1000, 2, 4)',
      boolean: '@boolean', null: null,
    };
    return map[type] || '@string';
  }

  /* ======== Feature 23: 启发式 Mock 生成 ======== */
  /**
   * 根据 schema 生成启发式 mock 值
   * @param {object} schema
   * @param {string} [fieldKey] 可选，对象属性的字段名，用于 key-based 启发式匹配
   */
  _genHeuristicMock(schema, fieldKey) {
    if (!schema) return {};
    if (schema.$ref) {
      const resolved = this._typeRegistry[schema.$ref];
      return resolved ? this._genHeuristicMock(resolved, fieldKey) : {};
    }
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum) return schema.enum[0];
    if (schema.oneOf) return this._genHeuristicMock(schema.oneOf[0], fieldKey);
    if (schema.anyOf) return this._genHeuristicMock(schema.anyOf[0], fieldKey);
    if (schema.allOf) {
      const merged = {};
      for (const s of schema.allOf) Object.assign(merged, this._genHeuristicMock(s, fieldKey));
      return merged;
    }
    if (schema.type === 'array') {
      const item = schema.items ? this._genHeuristicMock(schema.items) : 'sample';
      return [item, item];
    }
    if (schema.type === 'object' || schema.properties) {
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        obj[k] = this._genHeuristicMock(v, k);  // 传递字段名用于 key 启发
      }
      return obj;
    }
    // 如果提供了字段名，优先按字段名启发式生成，否则按类型 fallback
    if (fieldKey) return this._heuristicByKey(fieldKey, schema.type);
    return this._heuristicPrimitive(schema.type);
  }

  /**
   * 根据字段名启发式生成真实感 mock 值
   */
  _heuristicByKey(key, type) {
    const k = key.toLowerCase();
    // ID 类
    if (k === 'id' || k.endsWith('id') || k.endsWith('_id')) return Math.floor(Math.random() * 10000) + 1;
    // 名称
    if (k.includes('name') || k.includes('title')) return '示例名称';
    // 邮箱
    if (k.includes('email') || k.includes('mail')) return 'user@example.com';
    // 电话
    if (k.includes('phone') || k.includes('tel') || k.includes('mobile')) return '13800138000';
    // URL
    if (k.includes('url') || k.includes('link') || k.includes('href')) return 'https://example.com';
    // 图片
    if (k.includes('avatar') || k.includes('image') || k.includes('photo') || k.includes('icon') || k.includes('logo') || k.includes('img')) return 'https://picsum.photos/200/200';
    // 状态/类型枚举
    if (k === 'status' || k === 'state') return 'active';
    if (k.includes('type') || k.includes('kind') || k.includes('category')) return 'default';
    // 时间相关
    if (k.includes('time') || k.includes('date') || k.includes('timestamp')) return new Date().toISOString();
    if (k.includes('created')) return new Date(Date.now() - 86400000).toISOString();
    if (k.includes('updated')) return new Date().toISOString();
    // 金额
    if (k.includes('price') || k.includes('amount') || k.includes('money') || k.includes('cost') || k.includes('fee')) return 99.99;
    // 数量
    if (k.includes('count') || k.includes('num') || k.includes('total') || k.includes('size') || k.includes('length')) return Math.floor(Math.random() * 100);
    // 描述
    if (k.includes('desc') || k.includes('remark') || k.includes('note') || k.includes('comment') || k.includes('content') || k.includes('body') || k.includes('message')) return '一段示例描述文本';
    // 颜色
    if (k.includes('color') || k.includes('colour')) return '#1890ff';
    // 百分比
    if (k.includes('percent') || k.includes('rate') || k.includes('ratio')) return Math.floor(Math.random() * 100);
    // 布尔值相关字段名
    if (k.startsWith('is') || k.startsWith('has') || k.startsWith('can') || k === 'enabled' || k === 'disabled' || k === 'active' || k === 'deleted') return true;
    // 标签
    if (k.includes('tag') || k.includes('label') || k.includes('key')) return 'default-tag';

    return this._heuristicPrimitive(type);
  }

  _heuristicPrimitive(type) {
    switch (type) {
      case 'string': return '示例字符串';
      case 'integer': return Math.floor(Math.random() * 1000);
      case 'number': return +(Math.random() * 100).toFixed(2);
      case 'boolean': return Math.random() > 0.5;
      case 'null': return null;
      default: return '示例';
    }
  }

  _genMockValue(schema) {
    if (schema.$ref) {
      const refName = schema.$ref;
      if (this._typeRegistry[refName]) {
        return this._genMockFromSchema(this._typeRegistry[refName]);
      }
      return {};
    }
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum) return schema.enum[0];
    if (schema.oneOf) return this._genMockValue(schema.oneOf[0]);
    if (schema.anyOf) return this._genMockValue(schema.anyOf[0]);
    if (schema.allOf) {
      const merged = {};
      for (const s of schema.allOf) {
        Object.assign(merged, this._genMockValue(s));
      }
      return merged;
    }
    if (schema.type === 'array') {
      const item = schema.items ? this._genMockValue(schema.items) : 'string';
      return [item, item];
    }
    if (schema.type === 'object' || schema.properties) {
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        obj[k] = this._genMockValue(v);
      }
      return obj;
    }
    return this._primitiveMock(schema.type);
  }

  _genMockFromSchema(schema) {
    if (!schema) return {};
    if (schema.properties) {
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties)) {
        obj[k] = this._genMockValue(v);
      }
      return obj;
    }
    return {};
  }

  _primitiveMock(type) {
    const mocks = { string: '"string"', integer: '0', number: '0', boolean: 'false', null: 'null' };
    const raw = mocks[type] || '"string"';
    try { return JSON.parse(raw); } catch { return raw; }
  }

  /* ======== 工具方法 ======== */
  _toCamel(str) {
    // handles operationId patterns like getPets, create_user, etc
    return str
      .replace(/[_-](\w)/g, (_, c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^./, m => m.toLowerCase());
  }
  _toPascal(str) {
    const camel = this._toCamel(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }
  _toKebab(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
  }
  _pathToPascal(path) {
    return path
      .replace(/^\/|\/$/g, '')
      .split('/')
      .filter(s => s && !s.startsWith('{'))
      .map(s => this._toPascal(s))
      .join('');
  }
  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  _getPathGroup(path) {
    const segs = path.replace(/^\/|\/$/g, '').split('/');
    return segs[0] || 'root';
  }

  /** 获取所有 tags 用于 UI 过滤 */
  getTags() {
    if (!this.spec) return [];
    const tags = new Set();
    for (const op of this.spec.operations) {
      for (const t of op.tags) tags.add(t);
    }
    return [...tags].sort();
  }

  /** 获取所有 paths 用于 UI */
  getPaths() {
    if (!this.spec) return [];
    return [...new Set(this.spec.operations.map(o => o.path))].sort();
  }

  /** 获取统计信息 */
  getStats() {
    if (!this.spec) return null;
    const ops = this.filterOps();
    return {
      totalOps: this.spec.operations.length,
      filteredOps: ops.length,
      tags: this.getTags().length,
      schemas: Object.keys(this.spec.schemas).length,
      version: this.spec.version,
    };
  }

  /* ======== ContentType 解析辅助 ======== */
  /** 获取操作的 contentType，按优先级：per-op override > op.consumes > config default */
  _getOperationContentType(op) {
    const cfg = this.config;
    const key = `${op.method} ${op.path}`;
    if (cfg.contentTypeMap[key]) return cfg.contentTypeMap[key];
    if (op.requestBody?.contentType) return op.requestBody.contentType;
    if (op.consumes && op.consumes.length > 0) {
      return op.consumes[0];
    }
    return cfg.defaultContentType || 'application/json';
  }

  /* ======== Prettier 格式化 ======== */
  /**
   * 使用 Prettier Standalone 格式化代码。
   * 需要页面已加载:
   *   - https://unpkg.com/prettier@3/standalone.js
   *   - https://unpkg.com/prettier@3/plugins/typescript.js
   * 调用 way: await engine.formatCode(code) or engine.formatCodeSync(code)
   */
  async formatCode(code) {
    const cfg = this.config;
    if (!cfg.prettierEnabled) return code;
    if (typeof prettier === 'undefined' || typeof prettier.format !== 'function') {
      console.warn('[SwaggerTSEngine] Prettier 未加载，跳过格式化');
      return code;
    }
    try {
      const parser = 'typescript';
      const plugins = [];
      // prettierPlugins is a global from standalone.js
      if (typeof prettierPlugins !== 'undefined' && prettierPlugins.typescript) {
        plugins.push(prettierPlugins.typescript);
      }
      if (typeof prettierPlugins !== 'undefined' && prettierPlugins.estree) {
        plugins.push(prettierPlugins.estree);
      }
      const result = await prettier.format(code, {
        parser,
        plugins,
        tabWidth: cfg.prettierTabWidth,
        semi: cfg.prettierSemi,
        singleQuote: cfg.prettierSingleQuote,
        trailingComma: cfg.prettierTrailingComma,
        printWidth: cfg.prettierPrintWidth,
      });
      this._prettierReady = true;
      return result;
    } catch (e) {
      console.warn('[SwaggerTSEngine] Prettier 格式化失败:', e.message);
      return code;
    }
  }

  /** 同步版：如果 Prettier 未加载，返回 null */
  formatCodeSync(code) {
    const cfg = this.config;
    if (!cfg.prettierEnabled) return code;
    if (typeof prettier === 'undefined') return null;
    try {
      const plugins = [];
      if (typeof prettierPlugins !== 'undefined' && prettierPlugins.typescript) {
        plugins.push(prettierPlugins.typescript);
      }
      if (typeof prettierPlugins !== 'undefined' && prettierPlugins.estree) {
        plugins.push(prettierPlugins.estree);
      }
      return prettier.format(code, {
        parser: 'typescript',
        plugins,
        tabWidth: cfg.prettierTabWidth,
        semi: cfg.prettierSemi,
        singleQuote: cfg.prettierSingleQuote,
        trailingComma: cfg.prettierTrailingComma,
        printWidth: cfg.prettierPrintWidth,
      });
    } catch {
      return null;
    }
  }

  /** 对 generate() 返回的 files 统一格式化 */
  async formatFiles(files) {
    const formatted = [];
    for (const f of files) {
      try {
        const content = await this.formatCode(f.content);
        formatted.push({ ...f, content });
      } catch {
        formatted.push(f);
      }
    }
    return formatted;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SwaggerTSEngine };
}
