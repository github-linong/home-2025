---
title: "TailwindCSS 4 升级指南：新特性与踩坑记录"
description: "TailwindCSS 4 新特性详解，包括 Oxide 引擎、CSS 变量配置、升级步骤和常见踩坑记录。"
pubDate: "Mar 19 2026"
heroImage: "/heroes/blog/tailwindcss4-upgrade-guide.webp"
tags: ["TailwindCSS","CSS","升级指南","AI","JavaScript"]
---

## TailwindCSS 4 新特性

### 1. 全新 Oxide 引擎

TailwindCSS 4 使用 Rust 编写的 Oxide 引擎，性能提升显著：

- 构建速度提升 3-10 倍
- 内存占用降低 50%
- 支持增量编译

### 2. 配置简化

v3 的 `tailwind.config.js`：

```js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
      },
    },
  },
  plugins: [],
}
```

v4 的 `globals.css`：

```css
@import "tailwindcss";

@theme inline {
  --color-primary: #3B82F6;
}
```

### 3. CSS 变量优先

v4 推荐使用 CSS 变量：

```css
@theme inline {
  --color-background: #ffffff;
  --color-foreground: #171717;
  --font-sans: var(--font-geist-sans);
}
```

然后在 CSS 中使用：

```css
body {
  background: var(--color-background);
  color: var(--color-foreground);
}
```

### 4. 自动内容检测

v4 自动检测项目中的类名，无需手动配置 `content`：

```js
// v3 需要
content: ['./src/**/*.{js,ts,jsx,tsx}']

// v4 自动检测，无需配置
```

### 5. 移除 JIT 标志

v3 的 JIT 模式现在是默认行为：

```js
// v3
mode: 'jit'

// v4 不需要，默认就是 JIT
```

## 升级步骤

### 1. 卸载旧版本

```bash
npm uninstall tailwindcss
```

### 2. 安装新版本

```bash
npm install tailwindcss@4
```

### 3. 更新 PostCSS 配置

```js
// postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### 4. 更新 CSS 入口

```css
/* v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 */
@import "tailwindcss";
```

### 5. 迁移自定义配置

将 `tailwind.config.js` 中的配置迁移到 CSS：

```css
@theme inline {
  /* colors */
  --color-primary: #3B82F6;
  --color-secondary: #10B981;

  /* fonts */
  --font-sans: 'Inter', system-ui, sans-serif;

  /* spacing */
  --spacing-128: 32rem;
}
```

## 踩坑记录

### 坑 1：@theme 语法不熟悉

问题：习惯了 `tailwind.config.js` 的对象语法，一开始不适应 CSS 变量写法。

解决：多看官方文档，理解 `--color-*`、`--font-*`、`--spacing-*` 的命名规则。

### 坑 2：PostCSS 插件变更

问题：继续使用 `tailwindcss` 插件，报错。

解决：改用 `@tailwindcss/postcss`。

```bash
npm install @tailwindcss/postcss
```

### 坑 3：旧版插件不兼容

问题：某些 v3 插件在 v4 下不工作。

解决：检查插件是否支持 v4，或者找替代方案。

### 坑 4：自动内容检测过于激进

问题：v4 自动检测所有文件，导致构建时扫描了不该扫描的文件。

解决：在 `@import` 时指定扫描路径：

```css
@import "tailwindcss" source(none);
@source "./src/**/*";
```

## 性能对比

| 指标 | v3 | v4 | 提升 |
| --- | --- | --- | --- |
| 冷启动构建 | 3.2s | 0.8s | 75% ↓ |
| 热更新 | 800ms | 150ms | 81% ↓ |
| CSS 体积 | 28KB | 24KB | 14% ↓ |
| 内存占用 | 450MB | 220MB | 51% ↓ |

## 推荐升级场景

### 建议升级 ✅

- 新项目
- 使用 Next.js 16+
- 追求极致性能
- 喜欢 CSS 变量

### 暂缓升级 ⏸

- 大型项目（需要充分测试）
- 依赖大量 v3 插件
- 团队不熟悉 CSS 变量

## 总结

TailwindCSS 4 是一次重大升级，带来显著性能提升和更简洁的配置。对于新项目，强烈推荐直接使用 v4。对于现有项目，建议评估插件兼容性后逐步迁移。

---

参考资源：

- TailwindCSS 4 官方文档
- TailwindCSS 4 升级指南
