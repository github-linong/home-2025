// ==========================
//  拼拼卡 · PinPin Cards
//  Phaser 3 Puzzle Game Demo
// ==========================

// ---------- 全局常量 ----------
const GAME_W = 400;
const GAME_H = 700;
const BG_COLOR = '#FFF8F0';
const MAIN_COLOR = 0xFF9A6C;     // 暖橘主色
const MAIN_COLOR_STR = '#FF9A6C';
const DARK_COLOR = '#5D4037';    // 深棕文字
const ACCENT_GREEN = '#66BB6A';
const CARD_PICS = [
    { key: 'img1', name: '🌸 春樱', cardName: '樱花卡' },
    { key: 'img2', name: '🐱 橘猫', cardName: '猫咪卡' },
    { key: 'img3', name: '🍰 草莓蛋糕', cardName: '蛋糕卡' },
];
const DIFFICULTIES = [
    { label: '简单 2×2', grid: 2, pieces: 4 },
    { label: '普通 3×3', grid: 3, pieces: 9 },
    { label: '困难 4×4', grid: 4, pieces: 16 },
];
const SNAP_DIST = 32; // 吸附距离

// ---------- 工具函数 ----------
/** 从 localStorage 读取已收集卡牌 */
function getCollection() {
    try {
        const raw = localStorage.getItem('pinpin_collection');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}
/** 添加卡牌到收藏 */
function addToCollection(cardIndex) {
    const col = getCollection();
    if (!col.includes(cardIndex)) {
        col.push(cardIndex);
        localStorage.setItem('pinpin_collection', JSON.stringify(col));
    }
}
/** 格式化时间 mm:ss */
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ============================
//  Scene: Boot（资源加载）
// ============================
class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    preload() {
        // 加载进度条
        const w = GAME_W, cx = w / 2, cy = GAME_H / 2;
        this.cameras.main.setBackgroundColor(BG_COLOR);
        const bg = this.add.graphics();
        bg.fillStyle(MAIN_COLOR, 0.12);
        bg.fillRoundedRect(cx - 120, cy - 20, 240, 40, 20);

        const bar = this.add.graphics();
        this.load.on('progress', (v) => {
            bar.clear();
            bar.fillStyle(MAIN_COLOR, 1);
            bar.fillRoundedRect(cx - 116, cy - 16, 232 * v, 32, 16);
        });
        this.load.on('complete', () => { bg.destroy(); bar.destroy(); });

        // 图片资源
        this.load.image('img1', 'assets/img1.jpg');
        this.load.image('img2', 'assets/img2.jpg');
        this.load.image('img3', 'assets/img3.jpg');
        this.load.image('card_back', 'assets/card_back.png');
    }
    create() {
        this.scene.start('Menu');
    }
}

// ============================
//  Scene: Menu（主页 / 难度+图片选择）
// ============================
class MenuScene extends Phaser.Scene {
    constructor() { super('Menu'); }
    create() {
        this.cameras.main.setBackgroundColor(BG_COLOR);
        const cx = GAME_W / 2;
        let y = 50;

        // ---- 标题 ----
        this.add.text(cx, y, '🀄 拼拼卡', {
            fontSize: '36px', fontFamily: 'sans-serif', color: DARK_COLOR,
            fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        y += 60;
        this.add.text(cx, y, '拖拽拼图，收集卡牌！', {
            fontSize: '14px', fontFamily: 'sans-serif', color: '#A1887F',
        }).setOrigin(0.5, 0);
        y += 40;

        // ---- 选择图片 (3张缩略图) ----
        this.add.text(cx, y, '选择图片', {
            fontSize: '16px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        y += 30;

        this.selectedPic = 0;
        this.picThumbs = [];
        const thumbSize = 90, thumbGap = 14, totalW = 3 * thumbSize + 2 * thumbGap;
        const startX = cx - totalW / 2 + thumbSize / 2;

        for (let i = 0; i < 3; i++) {
            const tx = startX + i * (thumbSize + thumbGap);
            const thumb = this.add.image(tx, y + thumbSize / 2, CARD_PICS[i].key)
                .setDisplaySize(thumbSize, thumbSize);
            // 圆角裁剪（用graphics画圆角mask）
            const maskG = this.make.graphics({ x: tx - thumbSize / 2, y: y });
            maskG.fillStyle(0xffffff);
            maskG.fillRoundedRect(0, 0, thumbSize, thumbSize, 12);
            thumb.setMask(maskG.createGeometryMask());

            // 选中边框
            const border = this.add.graphics();
            border.lineStyle(3, MAIN_COLOR, 1);
            border.strokeRoundedRect(tx - thumbSize / 2, y, thumbSize, thumbSize, 12);
            if (i !== 0) border.setAlpha(0);
            this.picThumbs.push({ thumb, border });

            // 图片名
            this.add.text(tx, y + thumbSize + 8, CARD_PICS[i].name, {
                fontSize: '11px', fontFamily: 'sans-serif', color: '#8D6E63',
            }).setOrigin(0.5, 0);

            // 点击选择
            const hitArea = this.add.zone(tx, y + thumbSize / 2, thumbSize, thumbSize)
                .setInteractive({ useHandCursor: true });
            hitArea.on('pointerdown', () => this.selectPic(i));
        }
        y += thumbSize + 38;

        // ---- 选择难度 ----
        this.add.text(cx, y, '选择难度', {
            fontSize: '16px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        y += 30;

        this.selectedDiff = 0; // 默认简单
        this.diffBtns = [];
        this._diffBtnYs = [];  // 记录每个按钮的Y坐标
        this._diffLabels = []; // 记录按钮文字
        for (let i = 0; i < DIFFICULTIES.length; i++) {
            const d = DIFFICULTIES[i];
            const btnY = y + i * 52;
            this._diffBtnYs.push(btnY);
            const btn = this.add.graphics();
            this.drawDiffBtn(btn, cx, btnY, i === 0);
            this.diffBtns.push(btn);

            const labelColor = i === 0 ? '#ffffff' : DARK_COLOR;
            const txt = this.add.text(cx, btnY + 22, d.label, {
                fontSize: '14px', fontFamily: 'sans-serif', color: labelColor, fontStyle: 'bold',
            }).setOrigin(0.5, 0.5);
            this._diffLabels.push(txt);

            const hitArea = this.add.zone(cx, btnY + 22, 220, 44)
                .setInteractive({ useHandCursor: true });
            hitArea.on('pointerdown', () => this.selectDiff(i));
        }
        y += DIFFICULTIES.length * 52 + 30;

        // ---- 开始按钮 ----
        this.createButton(cx, y, '🎮 开始拼图', () => {
            this.scene.start('Game', {
                picIndex: this.selectedPic,
                diffIndex: this.selectedDiff,
            });
        });
        y += 60;

        // ---- 图鉴按钮 ----
        this.createButton(cx, y, '📖 我的图鉴', () => {
            this.scene.start('Collection');
        }, false, 0xFFA726);

        // 底部说明
        this.add.text(cx, GAME_H - 30, `已收集 ${getCollection().length}/3 张卡牌`, {
            fontSize: '12px', fontFamily: 'sans-serif', color: '#BCAAA4',
        }).setOrigin(0.5, 0.5);
    }

    selectPic(idx) {
        this.selectedPic = idx;
        for (let i = 0; i < this.picThumbs.length; i++) {
            this.picThumbs[i].border.setAlpha(i === idx ? 1 : 0);
        }
    }
    selectDiff(idx) {
        this.selectedDiff = idx;
        for (let i = 0; i < this.diffBtns.length; i++) {
            this.drawDiffBtn(this.diffBtns[i], GAME_W / 2, this._diffBtnYs[i], i === idx);
            this._diffLabels[i].setColor(i === idx ? '#ffffff' : DARK_COLOR);
        }
    }
    drawDiffBtn(gfx, cx, y, selected) {
        gfx.clear();
        gfx.fillStyle(selected ? MAIN_COLOR : 0xffffff, 1);
        gfx.fillRoundedRect(cx - 110, y, 220, 44, 22);
        if (!selected) {
            gfx.lineStyle(2, MAIN_COLOR, 0.6);
            gfx.strokeRoundedRect(cx - 110, y, 220, 44, 22);
        }
    }
    createButton(cx, y, label, callback, large = true, color = MAIN_COLOR) {
        const w = large ? 200 : 160, h = large ? 48 : 40, r = large ? 24 : 20;
        const bg = this.add.graphics();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(cx - w / 2, y, w, h, r);
        // 阴影
        const shadow = this.add.graphics();
        shadow.fillStyle(color, 0.25);
        shadow.fillRoundedRect(cx - w / 2 + 2, y + 3, w, h, r);
        shadow.setDepth(-1);

        this.add.text(cx, y + h / 2, label, {
            fontSize: large ? '18px' : '14px', fontFamily: 'sans-serif',
            color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5);

        const zone = this.add.zone(cx, y + h / 2, w, h).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', callback);
        zone.on('pointerover', () => bg.setAlpha(0.85));
        zone.on('pointerout', () => bg.setAlpha(1));
    }
}

// ============================
//  Scene: Game（拼图主玩法）
// ============================
class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }
    init(data) {
        this.picIndex = data.picIndex || 0;
        this.diffIndex = data.diffIndex || 0;
    }
    create() {
        const diff = DIFFICULTIES[this.diffIndex];
        this.gridSize = diff.grid;       // 2/3/4
        this.pieceCount = diff.pieces;   // 4/9/16
        const puzzleArea = 360;          // 拼图区域边长
        this.puzzleX = (GAME_W - puzzleArea) / 2;
        this.puzzleY = 100;
        this.pieceW = Math.floor(puzzleArea / this.gridSize); // 每片显示宽度
        this.pieceH = this.pieceW;
        const cx = GAME_W / 2;

        // 获取原始素材尺寸（用于crop计算）
        const texKey = CARD_PICS[this.picIndex].key;
        const frame = this.textures.get(texKey).get(0);
        this._texW = frame.width;
        this._texH = frame.height;

        this.cameras.main.setBackgroundColor(BG_COLOR);
        this.placedCount = 0;
        this.startTime = Date.now();
        this._timerEvent = this.time.addEvent({ delay: 100, callback: () => this.updateTimer(), loop: true });

        // ---- 顶部栏 ----
        this.add.graphics()
            .fillStyle(0xffffff, 0.95)
            .fillRoundedRect(10, 8, GAME_W - 20, 44, 20);

        // 返回按钮
        const backBtn = this.add.text(30, 30, '← 返回', {
            fontSize: '14px', fontFamily: 'sans-serif', color: MAIN_COLOR_STR, fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', () => {
            this.time.removeAllEvents();
            this.scene.start('Menu');
        });

        // 难度标签
        this.add.text(cx, 30, `${DIFFICULTIES[this.diffIndex].label}`, {
            fontSize: '14px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
        }).setOrigin(0.5, 0.5);

        // 计时器显示
        this.timerText = this.add.text(GAME_W - 30, 30, '00:00', {
            fontSize: '15px', fontFamily: 'monospace', color: MAIN_COLOR_STR, fontStyle: 'bold',
        }).setOrigin(1, 0.5);

        // ---- 绘制拼图目标网格（隐约提示） ----
        const hintGrid = this.add.graphics();
        hintGrid.lineStyle(1, MAIN_COLOR, 0.2);
        for (let r = 0; r <= this.gridSize; r++) {
            hintGrid.lineBetween(
                this.puzzleX, this.puzzleY + r * this.pieceH,
                this.puzzleX + puzzleArea, this.puzzleY + r * this.pieceH
            );
            hintGrid.lineBetween(
                this.puzzleX + r * this.pieceW, this.puzzleY,
                this.puzzleX + r * this.pieceW, this.puzzleY + puzzleArea
            );
        }

        // ---- 底板（拼图完成后显示完整图） ----
        this.baseImage = this.add.image(
            this.puzzleX + puzzleArea / 2, this.puzzleY + puzzleArea / 2,
            CARD_PICS[this.picIndex].key
        ).setDisplaySize(puzzleArea, puzzleArea).setAlpha(0.15);

        // ---- 创建碎片 ----
        this.pieces = [];
        // 碎片散落区域（底部）
        const scatterY = this.puzzleY + puzzleArea + 20;
        const scatterH = GAME_H - scatterY - 20;

        for (let i = 0; i < this.pieceCount; i++) {
            const row = Math.floor(i / this.gridSize);
            const col = i % this.gridSize;

            // 随机散落位置
            let sx, sy;
            let tries = 0;
            do {
                sx = Phaser.Math.Between(10, GAME_W - 10);
                sy = Phaser.Math.Between(scatterY, scatterY + scatterH - this.pieceH);
                tries++;
            } while (tries < 50 && this._overlapsPiece(sx, sy));
            sy = Math.max(scatterY, Math.min(sy, scatterY + scatterH - this.pieceH));

            // 创建碎片 - 使用原始纹理+crop实现切片效果
            const piece = this.add.image(sx, sy, texKey)
                .setDisplaySize(this.pieceW, this.pieceH)
                .setInteractive({ useHandCursor: true });

            // crop基于原始纹理尺寸
            const cropW = this._texW / this.gridSize;
            const cropH = this._texH / this.gridSize;
            piece.setCrop(col * cropW, row * cropH, cropW, cropH);

            piece._correctX = this.puzzleX + col * this.pieceW + this.pieceW / 2;
            piece._correctY = this.puzzleY + row * this.pieceH + this.pieceH / 2;
            piece._index = i;
            piece._row = row;
            piece._col = col;
            piece._placed = false;

            // 拖拽事件
            this.input.setDraggable(piece);
            piece.on('drag', (_ptr, dragX, dragY) => {
                if (piece._placed) return;
                piece.x = dragX;
                piece.y = dragY;
                piece.setDepth(100);
            });
            piece.on('dragend', () => {
                if (piece._placed) return;
                piece.setDepth(0);
                this.checkSnap(piece);
            });

            this.pieces.push(piece);
        }

        // ---- 拼图区域圆角边框 ----
        const border = this.add.graphics();
        border.lineStyle(2, MAIN_COLOR, 0.4);
        border.strokeRoundedRect(this.puzzleX - 4, this.puzzleY - 4, puzzleArea + 8, puzzleArea + 8, 8);
    }

    _overlapsPiece(x, y) {
        const threshold = this.pieceW * 0.8;
        for (const p of this.pieces) {
            if (!p._placed &&
                Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold) {
                return true;
            }
        }
        return false;
    }

    checkSnap(piece) {
        const dx = Math.abs(piece.x - piece._correctX);
        const dy = Math.abs(piece.y - piece._correctY);
        if (dx < SNAP_DIST && dy < SNAP_DIST) {
            // 吸附！
            this.tweens.add({
                targets: piece,
                x: piece._correctX,
                y: piece._correctY,
                duration: 150,
                ease: 'Back.easeOut',
            });
            piece._placed = true;
            piece.disableInteractive();
            piece.setDepth(-1);
            this.placedCount++;

            // 吸附粒子效果
            this.emitSnapParticles(piece._correctX, piece._correctY);

            // 检查是否全部完成
            if (this.placedCount >= this.pieceCount) {
                this.time.delayedCall(400, () => this.onComplete());
            }
        }
    }

    emitSnapParticles(x, y) {
        for (let i = 0; i < 6; i++) {
            const p = this.add.graphics();
            const r = Phaser.Math.Between(3, 6);
            p.fillStyle(MAIN_COLOR, 0.8);
            p.fillCircle(0, 0, r);
            p.setPosition(x, y).setDepth(50);
            this.tweens.add({
                targets: p,
                x: x + Phaser.Math.Between(-40, 40),
                y: y + Phaser.Math.Between(-40, 40),
                alpha: 0,
                scale: 0,
                duration: 400,
                ease: 'Quad.easeOut',
                onComplete: () => p.destroy(),
            });
        }
    }

    updateTimer() {
        const elapsed = Date.now() - this.startTime;
        this.timerText.setText(formatTime(elapsed));
    }

    onComplete() {
        this.time.removeAllEvents();
        const elapsed = Date.now() - this.startTime;
        const cx = GAME_W / 2, cy = GAME_H / 2;

        // 隐藏所有碎片 -> 显示完整图片
        this.baseImage.setAlpha(1);
        this.pieces.forEach(p => {
            if (p._placed) {
                this.tweens.add({ targets: p, alpha: 0, duration: 300 });
            } else {
                p.setVisible(false);
            }
        });

        // ---- 拼完光效 ----
        const glow = this.add.graphics();
        glow.fillStyle(MAIN_COLOR, 0.15);
        glow.fillCircle(cx, this.puzzleY + 180, 200);
        glow.setDepth(10);
        this.tweens.add({
            targets: glow, alpha: 0, duration: 1200, delay: 500,
            onComplete: () => glow.destroy(),
        });

        // 闪白
        this.cameras.main.flash(400, 255, 255, 255);

        this.time.delayedCall(600, () => {
            // ---- 翻卡动画 ----
            this.showCardFlip(elapsed);
        });
    }

    showCardFlip(elapsed) {
        const cx = GAME_W / 2, cy = GAME_H / 2;

        // 卡片容器
        const cardW = 200, cardH = 280;
        const card = this.add.image(cx, cy, 'card_back').setDisplaySize(cardW, cardH);
        card.setScale(1, 1).setDepth(200);

        // 文字：拼图完成
        const doneText = this.add.text(cx, cy - cardH / 2 - 40, '✨ 拼图完成！', {
            fontSize: '24px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(200).setAlpha(0);

        const timeText = this.add.text(cx, cy - cardH / 2 - 10, `用时 ${formatTime(elapsed)}`, {
            fontSize: '16px', fontFamily: 'sans-serif', color: '#8D6E63',
        }).setOrigin(0.5).setDepth(200).setAlpha(0);

        // 翻卡动画 timeline
        this.tweens.add({ targets: [doneText, timeText], alpha: 1, duration: 400 });
        this.tweens.add({
            targets: card,
            scaleX: 0,
            duration: 400, delay: 600,
            ease: 'Quad.easeIn',
            onComplete: () => {
                // 翻到 "卡面" -> 显示收集到的卡片
                card.setTexture(CARD_PICS[this.picIndex].key);
                this.tweens.add({ targets: card, scaleX: 1, duration: 400, ease: 'Quad.easeOut' });
                // 获得卡牌文字
                const cardName = this.add.text(cx, cy + cardH / 2 + 20, `获得「${CARD_PICS[this.picIndex].cardName}」`, {
                    fontSize: '18px', fontFamily: 'sans-serif', color: MAIN_COLOR_STR, fontStyle: 'bold',
                }).setOrigin(0.5).setDepth(200).setAlpha(0);
                this.tweens.add({ targets: cardName, alpha: 1, duration: 400, delay: 200 });

                // 存入localStorage
                addToCollection(this.picIndex);
            }
        });

        // 按钮：再来一局 / 返回主页
        this.time.delayedCall(2100, () => {
            const by = cy + cardH / 2 + 60;
            this.createGameBtn(cx - 70, by, '🔄 再来', () => {
                this.scene.restart({ picIndex: this.picIndex, diffIndex: this.diffIndex });
            });
            this.createGameBtn(cx + 70, by, '🏠 主页', () => {
                this.scene.start('Menu');
            });
        });
    }

    createGameBtn(x, y, label, cb) {
        const w = 110, h = 40;
        const bg = this.add.graphics().setDepth(200);
        bg.fillStyle(MAIN_COLOR, 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 20);

        this.add.text(x, y, label, {
            fontSize: '14px', fontFamily: 'sans-serif', color: '#fff', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(200);

        this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(200)
            .on('pointerdown', cb);
    }
}

// ============================
//  Scene: Collection（图鉴）
// ============================
class CollectionScene extends Phaser.Scene {
    constructor() { super('Collection'); }
    create() {
        this.cameras.main.setBackgroundColor(BG_COLOR);
        const cx = GAME_W / 2;
        let y = 50;

        // 标题
        this.add.text(cx, y, '📖 我的图鉴', {
            fontSize: '28px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        y += 50;

        const collection = getCollection();
        const cardW = 140, cardH = 200, gap = 16;
        const startX = (GAME_W - (cardW * 2 + gap)) / 2 + cardW / 2;

        for (let i = 0; i < 3; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const cx2 = startX + col * (cardW + gap);
            const cy2 = y + row * (cardH + 50);

            const hasCard = collection.includes(i);

            if (hasCard) {
                // 已收集：显示卡片
                const card = this.add.image(cx2, cy2 + cardH / 2, CARD_PICS[i].key)
                    .setDisplaySize(cardW, cardH);
                // 圆角mask
                const maskG = this.make.graphics({ x: cx2 - cardW / 2, y: cy2 });
                maskG.fillStyle(0xffffff);
                maskG.fillRoundedRect(0, 0, cardW, cardH, 16);
                card.setMask(maskG.createGeometryMask());

                // 光效
                const shine = this.add.graphics();
                shine.fillStyle(MAIN_COLOR, 0.1);
                shine.fillRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 16);

                this.add.text(cx2, cy2 + cardH + 10, CARD_PICS[i].cardName, {
                    fontSize: '14px', fontFamily: 'sans-serif', color: DARK_COLOR, fontStyle: 'bold',
                }).setOrigin(0.5, 0);
                this.add.text(cx2, cy2 + cardH + 30, '✓ 已收集', {
                    fontSize: '11px', fontFamily: 'sans-serif', color: ACCENT_GREEN,
                }).setOrigin(0.5, 0);
            } else {
                // 未收集：灰色占位
                const placeholder = this.add.graphics();
                placeholder.fillStyle(0xE0E0E0, 0.5);
                placeholder.fillRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 16);
                placeholder.lineStyle(2, 0xE0E0E0, 1);
                placeholder.strokeRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 16);

                this.add.text(cx2, cy2 + cardH / 2, '?', {
                    fontSize: '48px', fontFamily: 'sans-serif', color: '#BDBDBD',
                }).setOrigin(0.5);

                this.add.text(cx2, cy2 + cardH + 10, '???', {
                    fontSize: '14px', fontFamily: 'sans-serif', color: '#BCAAA4',
                }).setOrigin(0.5, 0);
                this.add.text(cx2, cy2 + cardH + 30, '未收集', {
                    fontSize: '11px', fontFamily: 'sans-serif', color: '#BCAAA4',
                }).setOrigin(0.5, 0);
            }
        }

        y += 2 * (cardH + 50) + 30;

        // 返回按钮
        this.createCollectionBtn(cx, y, '🏠 返回主页', () => {
            this.scene.start('Menu');
        });

        // 清除记录按钮
        this.createCollectionBtn(cx, y + 50, '🗑 清除记录', () => {
            localStorage.removeItem('pinpin_collection');
            this.scene.restart();
        }, false, 0xBDBDBD);
    }

    createCollectionBtn(cx, y, label, cb, large = true, color = MAIN_COLOR) {
        const w = 180, h = 42, r = 21;
        const bg = this.add.graphics();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(cx - w / 2, y, w, h, r);

        this.add.text(cx, y + h / 2, label, {
            fontSize: '15px', fontFamily: 'sans-serif', color: '#fff', fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.zone(cx, y + h / 2, w, h).setInteractive({ useHandCursor: true })
            .on('pointerdown', cb);
    }
}

// ============================
//  Phaser 游戏配置 & 启动
// ============================
const config = {
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent: 'game-wrapper',
    backgroundColor: BG_COLOR,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuScene, GameScene, CollectionScene],
};

const game = new Phaser.Game(config);
