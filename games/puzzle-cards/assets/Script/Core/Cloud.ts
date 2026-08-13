// cocos/assets/Script/Core/Cloud.ts
// 云开发调用封装（Cocos 客户端）。统一 Promise 化 wx.cloud.callFunction。
export interface CloudResult<T = any> {
  code: number;
  data: T;
  msg: string;
}

let envReady = false;

function wxCloud(): any {
  // @ts-ignore
  return typeof wx !== 'undefined' && wx.cloud ? wx.cloud : null;
}

export function initCloud(env?: string): void {
  if (envReady) return;
  const cloud = wxCloud();
  if (!cloud) return;
  cloud.init({ env: env || 'puzzle-cards-prod', traceUser: true });
  envReady = true;
}

export function callFunction<T = any>(name: string, data: Record<string, any> = {}): Promise<CloudResult<T>> {
  initCloud();
  return new Promise((resolve, reject) => {
    const cloud = wxCloud();
    if (!cloud) {
      reject(new Error('wx.cloud not available'));
      return;
    }
    cloud.callFunction({
      name,
      data,
      success: (r: any) => resolve(r.result as CloudResult<T>),
      fail: (e: any) => reject(e),
    });
  });
}
