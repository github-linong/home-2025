// cocos/assets/Script/Core/Storage.ts
// 本地缓存封装（PRD U-005 弱网/断网缓存，恢复后由云端对账）。
export const Storage = {
  get<T>(key: string, fallback: T): T {
    try {
      // @ts-ignore
      const v = wx.getStorageSync(key);
      return v === '' || v == null ? fallback : (v as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: any): void {
    try {
      // @ts-ignore
      wx.setStorageSync(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      // @ts-ignore
      wx.removeStorageSync(key);
    } catch {
      /* ignore */
    }
  },
};
