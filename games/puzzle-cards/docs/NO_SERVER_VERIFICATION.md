# 拼拼卡 · 无服务端纯本地可玩版本 — 验证报告

> 日期：2026-08-12
> 目标：把游戏从"依赖微信云开发"改为**完全无服务端、断网可玩**版本（用户原话："你先实现无需要服务端的版本吧，目前完全不可玩"）。

## 结论
✅ **已实现并验证：五屏 + 真实卡面切片 + 本地存档（星级/解锁/集卡/抽卡频控）+ 抽卡，全部本地完成，零服务端依赖，编辑器预览 0 error / 0 warn。**

## 架构（新增/改造文件）
| 文件 | 作用 |
|---|---|
| `Core/LocalProfile.ts`（新） | 本地存档：wx.storage(key `ppk_profile_v1`)，编辑器退化为内存。导出集卡/星级/解锁/抽卡频控 + `toMeObject()` |
| `Core/LocalGacha.ts`（新） | 本地抽卡：权重 N700/R200/SR80/SSR20，保底 30，每日上限 2；`performFreeDraw()` 写档返回结果 |
| `Game/PuzzleScreen.ts` | 通关→本地存星 + 发卡（未拥有才发）+ 解锁下一关 |
| `Game/GachaScreen.ts` | 看广告免费抽（每日 2）→ 本地 `performFreeDraw` + 真实卡面结果弹窗 |
| `Game/CollectionScreen.ts` | 73 卡本地渲染（owned 亮真实卡面，未拥有灰显 `?`） |
| `Game/HomeScreen.ts` / `LevelSelectScreen.ts` | 本地进度/解锁显示 |
| `Core/Ad.ts` | `showRewarded()` 无广告单元时 `resolve(true)`，保证可玩 |
| `Core/Session.ts` | `getMe` 云端失败回退 `LocalProfile.toMeObject()` |
| `Game/Main.ts` | `__local` 调试钩子（`profile/owned/totalCards/totalStars/reset/draw`） |

## 无头验证（Puppeteer @ 编辑器预览 localhost:7456）
`/tmp/refresh_scripts.js` 重编译 22 脚本 → `/tmp/validate_local.js` 五屏逐屏自检：

| 屏幕 | 关键指标 | 判定 |
|---|---|---|
| Home | 7 节点，进度 0/0 | ✅ |
| LevelSelect | 59 锁 / 1 开 | ✅ |
| Puzzle | 4 真实切片，autoSolve 发 1 卡 | ✅ |
| 解锁后 | 58 锁 / 2 开（通1关解1关） | ✅ |
| Gacha | 按钮抽 1 卡（totalCards 2, gachaCount 1） | ✅ |
| Collection | 73 卡全真实卡面加载，2 owned | ✅ |
| **错误/警告** | **ERRORS 0 / WARNS 0** | ✅ |

拼图吸附专项（`/tmp/test_snap.js`，2026-08-12 追加）：
- 修复前：碎片尺寸为 `pieceSize - 6`，拼好后仍有白缝；吸附阈值仅 30px，无磁性反馈，吸附后仍可拖走。
- 修复后：碎片改为 `pieceSize` 填满格；吸附阈值 `max(35, min(60, size*0.4))`（约 35~60px）；拖拽靠近正确位置时放大 1.08 提示；松手吸附并锁死碎片，带 1.12→1.0 弹跳反馈。
- 测试：把碎片 0 放到正确位置 `(+20,+20)` 偏移处（距离≈28px），触发 `touch-end` 后自动归位到 `(-144,-224)`，0 error。

抽卡频控专项（`/tmp/test_gacha.js`）：
- `__local.draw()` ×3 → 第1、2次各得 1 卡，第3次**空（达每日上限 2）** ✅
- 按钮 `click` → `doDraw` → 广告门控(resolve true) → `performFreeDraw` → 真实卡面弹窗，gachaCount 1 ✅

## 踩坑记录
1. **预览跑旧 bundle**：改 TS 后必须用 `refresh_scripts.js` 触发 22 脚本重编译，否则看不到新钩子。
2. **无头按钮测试误对 label 子节点 emit('click')**：点击 handler 挂在按钮节点（含 `cc.Button`），Label 是子节点；修正后验证通过。
3. `MEMORY.md` 超限（14KB）→ 已精简整理。

## 2026-08-12 第二次迭代：参考图风格改造拼图屏
用户给出 4 张参考图（古风夜色 + 顶部倒计时 + 底部提示/加时/原图三按钮 + 通关大图金光），要求"学习风格优化"。改造内容：

### 视觉改造（`Game/PuzzleScreen.ts`）
- 背景改为深色夜空（`#1A1A2E`），抛弃暖色糖果小面板。
- 顶部：左侧 ✕ 返回、中间"第 X 关"、右侧黑底圆角倒计时标签。
- 中部：完整目标图作为网格底图（60% 透明度，既参考又不怕盖住碎片）+ 淡色网格线。
- 底部：三个深色工具按钮（`💡提示`、`⏱加时`、`👁原图`），每个带视频小标。
- 通关界面：全屏暗色遮罩 + `Graphics` 金色放射光芒 + 中央大图 + 星级 + 新卡 + "首页"/"下一关"按钮。

### 功能新增
| 功能 | 实现 | 验证 |
|---|---|---|
| 倒计时 | 按关卡 `timeLimitSec` 或 `stdTimeSec*2` 倒计时，最后 10 秒变红 | `/tmp/test_tools.js` ✅ |
| 提示 | 看广告后自动把一块未放碎片飞到正确位置 | 点击后 placed +1 ✅ |
| 加时 | 看广告后 +30 秒，标签闪金色并飘 "+30s" | 00:59 → 01:29 ✅ |
| 原图 | 看广告后全屏显示完整大图 3 秒 | dim+Image 弹出并自动消失 ✅ |
| 下一关 | 通关界面若存在下一关则显示按钮 | 已传入 `onNext` ✅ |

### 验证结果
- 五屏全量 `/tmp/validate_local.js`：**0 error / 0 warn** ✅
- 吸附 `/tmp/test_snap.js`：碎片 0 偏移 20px 后自动归位 ✅
- 工具按钮 `/tmp/test_tools.js` + `/tmp/test_ref.js`：提示/加时/原图均触发 ✅

## 剩余可选项（非阻塞）
- 真机微信导出验证：构建发布→微信小游戏→导出 build/wechatgame→微信开发者工具（AppID/云函数非必须，因已纯本地）。
- 好友榜（开放数据域，二期接；当前纯本地存档不展示好友榜）。
- 若需云端进度同步，可保留 Session 云端双轨（当前已本地优先、云端失败静默回退）。
