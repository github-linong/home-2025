// cocos/assets/Script/Game/Main.ts
// 启动 + 屏幕管理：隐私 → 云初始化 → 登录 → 拉配置 → 首页。
// 所有界面在代码里程序化搭建（避免手写 .scene），颜色/文案走 Theme / Copy。
import { _decorator, Component, Node, find } from 'cc';
import { ensurePrivacy } from '../Core/Privacy';
import { initCloud, callFunction } from '../Core/Cloud';
import { Storage } from '../Core/Storage';
import { Copy } from '../Core/Copy';
import { ad } from '../Core/Ad';
import { login, getMe } from '../Core/Session';
import { addLabel, addButton, addPanel, addImage, stretch, sizeNode } from '../Core/UI';
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
  cfg: any = null;

  async start(): Promise<void> {
    this.ensureCanvas();
    this.ensureScreenRoot();

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

    const cached = Storage.get<any>('cfg', null);
    if (cached) this.cfg = cached;
    try {
      const res = await callFunction('config', {});
      if (res && res.code === 0) {
        this.cfg = res.data;
        Storage.set('cfg', res.data);
      }
    } catch {
      /* 弱网用缓存 */
    }

    await login();
    await getMe();

    this.showScreen('home');
  }

  private ensureCanvas(): void {
    if (find('Canvas')) return;
    // @ts-ignore
    const { Node: N, Canvas, UITransform, view } = cc;
    const canvas = new N('Canvas');
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
        });
        break;
      case 'collection':
        buildCollectionScreen(this.screenNode!, { cfg: this.cfg, onBack: () => this.showScreen('home') });
        break;
      case 'gacha':
        buildGachaScreen(this.screenNode!, { onBack: () => this.showScreen('home') });
        break;
    }
  }
}
