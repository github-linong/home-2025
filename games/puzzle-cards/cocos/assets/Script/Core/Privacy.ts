// cocos/assets/Script/Core/Privacy.ts
// 隐私合规（PRD U-006）：首次进入请求隐私授权。小游戏用 wx.requirePrivacyAuthorize。
export function ensurePrivacy(): Promise<boolean> {
  return new Promise((resolve) => {
    // @ts-ignore
    if (typeof wx === 'undefined' || !wx.requirePrivacyAuthorize) {
      resolve(true);
      return;
    }
    // @ts-ignore
    wx.requirePrivacyAuthorize({
      // @ts-ignore
      success: () => resolve(true),
      // @ts-ignore
      fail: () => resolve(false),
    });
  });
}
