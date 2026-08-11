// cocos/assets/Script/Core/Cloud.ts
// 云开发调用封装（Cocos 客户端）。统一 Promise 化 wx.cloud.callFunction。
export interface CloudResult<T = any> {
  code: number;
  data: T;
  msg: string;
}

let envReady = false;

export function initCloud(env?: string): void {
  if (envReady) return;
  // @ts-ignore
  if (typeof wx !== 'undefined' && wx.cloud) {
    // @ts-ignore
    wx.cloud.init({ env: env || 'puzzle-cards-prod', traceUser: true });
    envReady = true;
  }
}

export function callFunction<T = any>(name: string, data: Record<string, any> = {}): Promise<CloudResult<T>> {
  initCloud();
  return new Promise((resolve, reject) => {
    // @ts-ignore
    wx.cloud.callFunction({
      name,
      data,
      // @ts-ignore
      success: (r: any) => resolve(r.result as CloudResult<T>),
      // @ts-ignore
      fail: (e: any) => reject(e),
    });
  });
}
