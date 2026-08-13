// cocos/assets/Script/Core/Ad.ts
// 纯 IAA 广告管理（拼拼卡 · 无 IAP）：激励视频 / 插屏 / Banner。
// 广告位 id 需在微信 MP 后台「流量主」申请；未配置时所有方法安全降级（返回 false / 不报错）。
export class AdManager {
  private rewarded: any = null;
  private interstitial: any = null;
  private banner: any = null;
  private bannerAdUnitId = '';
  private inited = false;

  init(ids: { rewarded: string; interstitial: string; banner: string }): void {
    // @ts-ignore
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return;
    // @ts-ignore
    this.rewarded = wx.createRewardedVideoAd({ adUnitId: ids.rewarded });
    // @ts-ignore
    this.interstitial = wx.createInterstitialAd({ adUnitId: ids.interstitial });
    this.bannerAdUnitId = ids.banner;
    // @ts-ignore
    this.banner = wx.createBannerAd({
      adUnitId: ids.banner,
      style: { left: 0, top: 0, width: 320, height: 50 },
    });
    if (this.banner) this.banner.hide();
    this.inited = true;
  }

  get isReady(): boolean {
    return this.inited;
  }

  // 激励视频：看完返回 true（用于免费抽卡 / 复活等）。
  // 无广告单元（编辑器 / 离线 / 未配置流量主）时安全降级为 true，保证游戏可玩。
  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.rewarded) {
        resolve(true);
        return;
      }
      const onClose = (r: any) => {
        this.rewarded.offClose(onClose);
        resolve(!!(r && r.isEnded !== false));
      };
      this.rewarded.onClose(onClose);
      this.rewarded.show().catch(() => this.rewarded.load().then(() => this.rewarded.show()));
    });
  }

  showInterstitial(): void {
    if (!this.interstitial) return;
    this.interstitial.show().catch(() => this.interstitial.load());
  }

  showBanner(): void {
    if (this.banner) this.banner.show().catch(() => {});
  }

  hideBanner(): void {
    if (this.banner) this.banner.hide();
  }
}

export const ad = new AdManager();
