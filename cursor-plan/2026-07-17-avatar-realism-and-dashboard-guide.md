# 数字人真人化 + 民生大屏导览 Demo

## 目标

1. 数字人观感尽量接近真人：以「像」为验收原则，迭代模型资产与渲染参数直到达到纯浏览器栈的最佳水平。
2. 民生大屏导览 Demo（已完成并上线，详见 `2026-07-17-livelihood-dashboard-guide.md`）。

## 范围 / 非目标

- 范围：RPM 高保真形象资产、TalkingHead 光照/渲染参数调优、两页共享数字人客户端模块抽取。
- 非目标：MetaHuman 级照片级渲染（栈不可达，已声明上限）；Avaturn 照片生成形象（需用户照片与授权，另行讨论）。

## 事实依据（已核实）

- TalkingHead 渲染器 `WebGLRenderer({ antialias: true, alpha: true })`，画布天然透明。
- 光照可调：`lightAmbient/lightDirect/lightSpot` 系列参数 + `setLighting()`，已有 ACES tone mapping 与 RoomEnvironment。
- 换模型硬约束：Mixamo 兼容骨骼 + ARKit blendshapes + Oculus visemes，否则口型/表情/MotionEngine 失效。
- RPM GLB 接口支持 `textureSizeLimit=2048&textureQuality=high` 高清导出，显著优于现用 1024 版 `brunette.glb`。

## 步骤

1. 资产升级：通过 RPM 创建/获取偏写实成人形象，高清参数下载 GLB，新文件另名保存（保留旧资产）；验证 morph targets 完整。
2. 渲染调优：三点光布光（主光暖色、环境光降低、spot 轮廓光）、`modelPixelRatio` 放开、`avatarMood` 基线调整；两个 demo 页同步应用。
3. 截图迭代：正脸特写 / 全身 / 说话中三种状态本地对比，记录参数，直到栈内最佳。
4. 共享模块：抽取 `apps/web/src/lib/avatar/`（HeadAudio 初始化、CosyVoice 播报、viseme 近似、PCM 转换等两页重复逻辑），两页共同引用。
5. 构建、两页端到端回归、部署 web、线上冒烟。

## 执行结果（2026-07-17）

- RPM 已于 2026-01-31 被 Netflix 收购后关停全部公开服务，原计划的 RPM 高清导出不可行；改用 TalkingHead 官方仓库分发的 Avaturn 照片级写实形象 `avaturn.glb`（13.8 MB，含完整 ARKit + 15 Oculus visemes + Mixamo 骨骼，非商业演示用途），并套用官方 retarget/baseline 参数。
- 光照定稿（变体 C）：主光 0xffdcb4 / 30 / phi 1.1 / theta 2.55，环境光 0xf4f6ff / 1.1，轮廓光 0x99bbff / 20 / phi 0.35 / theta 4.6；`modelPixelRatio` 放开到设备 DPR。
- 共享模块落地：`apps/web/src/lib/avatar/`（`visuals.ts` 形象+光照、`speech.ts` viseme 近似+PCM、`headAudio.ts` 口型驱动），两页均已切换引用。
- 两页本地回归（加载、Qwen 问答、wave_right 动作、HeadAudio 口型、大屏 focus 移动）通过；已部署线上并冒烟通过。

## 风险 / 开放问题

- RPM 匿名创建流程可能被登录/验证码拦截：回退为对现有形象 ID 走高清参数重新下载 + 光照调优。
- 高清纹理（2048）文件体积增大，首次加载变慢：记录体积，必要时权衡 1024。
- 共享模块抽取可能引入两页回归：抽纯函数与独立子系统，页面编排逻辑不动，抽完两页各自回归。

## 验收标准

- 三种状态截图对比明显优于现状，光照无死黑/过曝。
- 口型（HeadAudio）、动作（MotionEngine/手势）、大屏 focus 移动无回归。
- 两页复用共享模块，构建通过，线上冒烟通过。
