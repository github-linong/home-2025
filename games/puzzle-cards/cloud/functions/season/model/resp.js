// cloud/model/resp.js
// 云函数统一响应格式。前端（Cocos）统一按 { code, data, msg } 解析。
// code: 0 成功；非 0 业务错误；5xx 服务端错误。

function ok(data = null, msg = 'ok') {
  return { code: 0, data, msg };
}

function fail(code, msg, data = null) {
  return { code, data, msg };
}

const E = {
  PARAM: 400,        // 参数错误
  AUTH: 401,         // 未登录 / 无权限
  NOT_FOUND: 404,    // 资源不存在
  CONFLICT: 409,     // 重复提交 / 状态冲突
  CHEAT: 422,        // 反作弊拦截
  LIMIT: 429,        // 频控 / 上限
  SERVER: 500,       // 服务端错误
};

module.exports = { ok, fail, E };
