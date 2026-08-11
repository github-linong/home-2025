// cloud/model/adControl.js
// 广告频控（PRD 12.3）。去广告用户全部不展示；新用户前 3 关保护。
const CAP = {
  dailyTotal: 15,
  minIntervalSec: 180,
  interstitialGapLevels: 2,
  newUserProtectLevels: 3,
};

function canShow({ todayCount = 0, lastAdTs = 0, userRemoveAds = false, now = Date.now() }) {
  if (userRemoveAds) return { ok: false, reason: 'removed' };
  if (todayCount >= CAP.dailyTotal) return { ok: false, reason: 'daily_cap' };
  if (lastAdTs && now - lastAdTs < CAP.minIntervalSec * 1000) return { ok: false, reason: 'interval' };
  return { ok: true };
}

// 插屏：至少间隔 2 个关卡（调用方维护 levelsSinceInterstitial）
function canShowInterstitial(levelsSinceInterstitial) {
  return levelsSinceInterstitial >= CAP.interstitialGapLevels;
}

// 新用户前 N 关不展示广告（PRD 12.3 新用户保护期）
function inNewUserProtect(levelsCleared) {
  return levelsCleared < CAP.newUserProtectLevels;
}

module.exports = { canShow, canShowInterstitial, inNewUserProtect, CAP };
