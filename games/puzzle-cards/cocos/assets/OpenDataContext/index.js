// cocos/assets/OpenDataContext/index.js
// 开放数据域（Open Data Context）：好友排行榜绘制。
// 小游戏分享到群无法拿到 openid 列表，好友榜必须走 wx.getFriendCloudStorage + 共享画布。
// 主域通过 wx.postMessage({ type: 'friendRank' }) 触发；sharedCanvas 由主域以 OpenDataContext 组件显示。
// 视觉沿用拼拼卡暖色糖果风（主色 #FF9A6C）。
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');

const PRIMARY = '#FF9A6C';
const ACCENT = '#FFD66B';
const TEXT = '#5A4A42';
const TEXT_LIGHT = '#9B8A82';

function drawRank(list, title) {
  ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  ctx.fillStyle = '#FFF7F1';
  ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  ctx.fillStyle = PRIMARY;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(title || '好友速度榜', 20, 44);
  list.slice(0, 20).forEach((u, i) => {
    ctx.fillStyle = i < 3 ? ACCENT : TEXT;
    ctx.font = i < 3 ? 'bold 20px sans-serif' : '20px sans-serif';
    ctx.fillText(`${i + 1}. ${u.nickname}  ${u.score}`, 20, 84 + i * 36);
  });
  if (list.length === 0) {
    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = '18px sans-serif';
    ctx.fillText('邀请好朋友一起来拼图吧', 20, 84);
  }
}

wx.onMessage((data) => {
  if (!data) return;
  if (data.type === 'friendRank') {
    wx.getFriendCloudStorage({
      keyList: ['score', 'collection'],
      success: (res) => {
        const list = (res.data || []).map((u) => {
          const kv = u.KVDataList || [];
          const score = Number(kv.find((k) => k.key === 'score')?.value || 0);
          return { nickname: u.nickname, score };
        }).sort((a, b) => b.score - a.score);
        drawRank(list, data.title || '好友速度榜');
      },
      fail: () => drawRank([], '好友速度榜'),
    });
  }
});
