// cocos/assets/Script/Core/Session.ts
// 登录与会话：优先 wx.login + 云函数；无服务端/离线时返回本地档案，保证游戏可玩。
import { callFunction } from './Cloud';
import { Storage } from './Storage';
import { toMeObject } from './LocalProfile';

let meCache: any = null;
let openidCache = '';

// 触发微信登录并返回 openid（本地缓存复用）
export async function login(): Promise<string> {
  const cached = Storage.get<string>('openid', '');
  if (cached) {
    openidCache = cached;
    return cached;
  }
  // @ts-ignore
  if (typeof wx === 'undefined') return 'dev-openid';
  const code = await new Promise<string>((resolve) => {
    // @ts-ignore
    wx.login({
      // @ts-ignore
      success: (r: any) => resolve(r.code || ''),
      // @ts-ignore
      fail: () => resolve(''),
    });
  });
  if (!code) return 'dev-openid';
  try {
    const res = await callFunction('login', { code });
    const openid = res && res.data && res.data.openid;
    if (openid) {
      openidCache = openid;
      Storage.set('openid', openid);
    }
  } catch {
    /* 离线/未开通云开发时降级，不阻断游戏 */
  }
  return openidCache || 'dev-openid';
}

export function getOpenid(): string {
  return openidCache || Storage.get<string>('openid', '');
}

// 读取个人档案：云端成功则用云端；否则用本地存档（无服务端版本）。
export async function getMe(force = false): Promise<any> {
  if (!force && meCache) return meCache;
  try {
    const res = await callFunction('me', {});
    if (res && res.code === 0 && res.data) {
      meCache = res.data;
      return meCache;
    }
  } catch {
    /* 无云端时本地兜底 */
  }
  meCache = toMeObject();
  return meCache;
}

export function clearMeCache(): void {
  meCache = null;
}
