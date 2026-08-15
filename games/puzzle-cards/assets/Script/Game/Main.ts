// cocos/assets/Script/Game/Main.ts
// 启动 + 屏幕管理：隐私 → 云初始化 → 登录 → 拉配置 → 首页。
// 所有界面在代码里程序化搭建（避免手写 .scene），颜色/文案走 Theme / Copy。
import { _decorator, Component, Node, find, Canvas, UITransform, view, ResolutionPolicy } from 'cc';
import { ensurePrivacy } from '../Core/Privacy';
import { initCloud, callFunction } from '../Core/Cloud';
import { Storage } from '../Core/Storage';
import { ad } from '../Core/Ad';
import { login, getMe } from '../Core/Session';
import { addLabel, addButton, addPanel, addImage, stretch, sizeNode, solidFrame } from '../Core/UI';
import { getDefaultConfig, GameConfig } from '../Core/Config';
import { getProfile, resetProfile, getOwnedCardIds, getTotalCards, getTotalStars } from '../Core/LocalProfile';
import { performFreeDraw } from '../Core/LocalGacha';
import { buildHome } from './HomeScreen';
import { buildLevelSelect } from './LevelSelectScreen';
import { buildPuzzleScreen } from './PuzzleScreen';
import { buildCollectionScreen } from './CollectionScreen';
import { buildGachaScreen } from './GachaScreen';

const { ccclass } = _decorator;

export type ScreenName = 'home' | 'levelSelect' | 'puzzle' | 'collection' | 'gacha';

@ccclass('Main')
export class Main extends Component {
  private screenNode: Node | null = null;
  cfg: GameConfig | null = null;

  async start(): Promise<void> {
    this.setupResolution();
    this.ensureCanvas();
    this.ensureScreenRoot();

    // 先给本地兜底配置，让首页/选关/图鉴立刻可渲染，不必等云端。
    this.cfg = getDefaultConfig();

    // 立刻显示首页（避免 async 初始化期间白屏）。
    this.showScreen('home');

    // 异步初始化：隐私、云、广告、登录、配置刷新，均不阻塞首页。
    this.runBackgroundInit();

    // 诊断日志：确认 UI 节点层级与兜底纹理是否就绪（刷新预览后看控制台）
    // @ts-ignore
    const canvas = find('Canvas');
    const first = this.screenNode && this.screenNode.children[0];
    console.log('[DIAG] canvas.layer=', canvas && canvas.layer,
      'screenNode.children=', this.screenNode && this.screenNode.children.length,
      'firstChild.layer=', first && first.layer,
      'solidFrame ok=', !!solidFrame());

    // 测试钩子：暴露 Main 实例，便于无头浏览器驱动屏幕切换与截图验证（对生产无副作用）。
    (globalThis as any).__ppk = this;
    // 本地存档调试钩子（无服务端版本）：供无头验证读取/重置进度，生产中也可用于调试。
    (globalThis as any).__local = {
      profile: () => getProfile(),
      owned: () => getOwnedCardIds(),
      totalCards: () => getTotalCards(),
      totalStars: () => {
        const cfg = getDefaultConfig();
        return getTotalStars((cfg.cards || []).map((c: any) => c.id));
      },
      reset: () => resetProfile(),
      draw: () => performFreeDraw(),
    };
  }

  private async runBackgroundInit(): Promise<void> {
    const agreed = await ensurePrivacy();
    if (!agreed) {
      // 拒绝授权不阻断：仍可进入游戏（隐私弹窗可在设置内再次触发）
    }
    initCloud();
    ad.init({
      rewarded: 'adunit-rewarded-ppk',
      interstitial: 'adunit-interstitial-ppk',
      banner: 'adunit-banner-ppk',
    });

    // 尝试刷新云端配置；失败仍用本地兜底。
    const cached = Storage.get<any>('cfg', null);
    if (cached && !this.cfg) this.cfg = cached;
    try {
      const res = await callFunction('config', {});
      if (res && res.code === 0 && res.data && Array.isArray(res.data.levels) && res.data.levels.length > 0) {
        this.cfg = res.data as GameConfig;
        Storage.set('cfg', res.data);
      }
    } catch {
      /* 弱网用本地兜底 */
    }

    // 登录与个人信息（仅用于展示，失败不阻断）。
    try { await login(); } catch { /* ignore */ }
    try { await getMe(); } catch { /* ignore */ }
  }

  // 手机竖屏小游戏：锁逻辑设计分辨率 720×1280（9:16 基准），FIT 等比适配。
  // 这是比例协调的根基——之前用引擎默认横屏 960×640（实测 1280×720），
  // 导致所有按"竖屏高瘦"写的布局被压成窄条、上下大块留白。
  private setupResolution(): void {
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIT);
    const canvas = find('Canvas');
    if (canvas) {
      const cv = canvas.getComponent(Canvas);
      if (cv) {
        cv.fitWidth = true;
        cv.fitHeight = true;
      }
    }
  }

  private ensureCanvas(): void {
    if (find('Canvas')) return;
    const canvas = new Node('Canvas');
    canvas.addComponent(Canvas);
    const ut = canvas.addComponent(UITransform);
    const v = view.getVisibleSize();
    ut.setContentSize(v.width, v.height);
    this.node.scene.addChild(canvas);
    canvas.addChild(this.node);
  }

  private ensureScreenRoot(): void {
    if (this.screenNode) return;
    this.screenNode = new Node('ScreenRoot');
    stretch(this.screenNode);
    this.node.addChild(this.screenNode);
    this.screenNode.layer = this.node.layer;
  }

  showScreen(name: ScreenName, payload?: any): void {
    if (!this.screenNode) this.ensureScreenRoot();
    this.screenNode!.removeAllChildren();

    switch (name) {
      case 'home':
        buildHome(this.screenNode!, {
          onStart: () => this.showScreen('levelSelect'),
          onGacha: () => this.showScreen('gacha'),
          onCollection: () => this.showScreen('collection'),
        });
        break;
      case 'levelSelect':
        buildLevelSelect(this.screenNode!, {
          cfg: this.cfg,
          onPick: (level: any) => this.showScreen('puzzle', level),
          onBack: () => this.showScreen('home'),
        });
        break;
      case 'puzzle':
        buildPuzzleScreen(this.screenNode!, {
          level: payload,
          cfg: this.cfg,
          onBack: () => this.showScreen('levelSelect'),
          onNext: (lvl: any) => this.showScreen('puzzle', lvl),
        });
        break;
      case 'collection':
        buildCollectionScreen(this.screenNode!, { cfg: this.cfg, onBack: () => this.showScreen('home') });
        break;
      case 'gacha':
        buildGachaScreen(this.screenNode!, { onBack: () => this.showScreen('home'), cfg: this.cfg });
        break;
    }
  }
}
