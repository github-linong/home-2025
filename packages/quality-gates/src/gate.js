// 闸门框架基础类型与结果构造器
// 每个闸门都是独立进程（out-of-context），只回一个结构化结果，互不污染上下文。
export const SEVERITY = { BLOCK: 'block', WARN: 'warn', INFO: 'info' };

export function gateResult(name, pass, severity, message, detail = null) {
  return { name, pass, severity, message, detail };
}
