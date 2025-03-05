# home-2025

个人网站项目，使用 monorepo 结构管理。
重新开始设计一个门户网站，放弃所有历史债务，思考如果我需要一个这样的东西，我应该做什么？
- 响应式，以此支持移动端展示，但是这好像不是必须得？
- 微前端，这边我可以任意的嵌入内容
- 文章管理
- 测试代码管理（StoryBook 使用这个来实现会怎么样？） 

## 项目结构

- `packages/web`: 主网站项目，基于 Next.js
- `packages/ui`: 共享 UI 组件库
- `packages/shared`: 共享工具和类型定义

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 代码检查
pnpm lint
```

## 技术栈

- Next.js 14
- TypeScript
- Tailwind CSS
- pnpm workspace
- tsup (构建工具)
- Vitest (测试框架)



