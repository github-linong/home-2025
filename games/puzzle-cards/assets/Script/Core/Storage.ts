// cocos/assets/Script/Core/Storage.ts
// 本地缓存封装（PRD U-005 弱网/断网缓存，恢复后由云端对账）。
// 编辑器环境无 wx 全局对象，所有访问必须先判断 typeof wx。
function wxApi(): any {
  // @ts-ignore
  return typeof wx !== 'undefined' ? wx : null;
}

export const Storage = {
  get<T>(key: string, fallback: T): T {
    const api = wxApi();
    if (!api) return fallback;
    try {
      const v = api.getStorageSync(key);
      return v === '' || v == null ? fallback : (v as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: any): void {
    const api = wxApi();
    if (!api) return;
    try {
      api.setStorageSync(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    const api = wxApi();
    if (!api) return;
    try {
      api.removeStorageSync(key);
    } catch {
      /* ignore */
    }
  },
};
