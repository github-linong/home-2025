# Home 2025 Web 项目

这是一个基于 Astro 构建的现代化网站项目，提供了多种功能和页面展示。

## 项目结构

项目采用 Astro 框架构建，结合了 Tailwind CSS 进行样式设计，支持静态生成和服务端渲染混合模式。

### 主要目录结构

```
packages/web-astro/
├── src/
│   ├── components/     # 组件目录
│   ├── config/         # 配置文件
│   ├── layouts/        # 布局组件
│   ├── pages/          # 页面文件
│   │   ├── api/        # API 端点
│   │   └── projects/   # 项目相关页面
│   └── styles/         # 样式文件
├── public/             # 静态资源
├── astro.config.mjs    # Astro 配置
└── tailwind.config.mjs # Tailwind 配置
```

## 主要功能

### 1. 项目展示

位于 `/projects` 路径，展示了多个项目卡片，每个项目包含：
- 封面图片（使用 SVG 格式）
- 项目标题
- 项目描述
- 标签列表

项目卡片采用响应式设计，在不同屏幕尺寸下自动调整布局。图片使用了原生的 `aspect-ratio` 属性确保一致的显示比例。

### 2. 外部页面代理

#### iframe 代理功能

位于 `/projects/iframe/` 路径，支持三种 URL 传递方式：
- Query 参数方式：`/projects/iframe/?url=https://example.com`
- 路径参数方式：`/projects/iframe/https://example.com`
- Hash 方式：`/projects/iframe/#https://example.com`

该功能包含域名白名单验证，确保只有允许的域名才能被嵌入显示。目前允许的域名包括：
- lilnong.top 及其子域名
- localhost
- 127.0.0.1

#### 服务器代理功能

位于 `/projects/astro-server-proxy/` 路径，同样支持三种 URL 传递方式：
- Query 参数方式：`/projects/astro-server-proxy/?url=https://example.com`
- 路径参数方式：`/projects/astro-server-proxy/https://example.com`
- Hash 方式：`/projects/astro-server-proxy/#https://example.com`

与 iframe 代理不同，服务器代理通过后端 API 获取外部内容，然后在服务器端处理后返回给客户端，可以避免跨域问题，并提供更好的安全性。

#### 代理面板

位于 `/projects/proxy-panel` 路径，提供了一个用户友好的界面来测试和管理代理 URL：
- 显示当前测试 URL 及其各种形式
- 提供 iframe 代理和服务器代理的预览功能
- 支持输入新的 URL 并生成对应的代理链接
- 使用 localStorage 保存用户输入的 URL，下次访问时自动恢复

### 3. 用户认证

提供了用户登录和注册功能：
- 登录页面：`/login`
- 注册页面：`/register`

这些页面包含表单验证和用户友好的界面设计。

## 技术特点

1. **混合渲染模式**：
   - 静态生成：用于大部分内容页面
   - 服务端渲染：用于动态内容，如代理页面

2. **现代化 UI**：
   - 使用 Tailwind CSS 构建响应式界面
   - 支持暗色模式
   - 采用卡片式设计和渐变背景

3. **安全措施**：
   - iframe 沙箱限制（sandbox="allow-scripts allow-same-origin allow-forms"）
   - 域名白名单验证
   - 内容安全策略
   - 服务器端代理过滤

4. **性能优化**：
   - 图片使用 SVG 格式减少加载时间
   - 懒加载 iframe 内容
   - 自动内联样式表
   - 服务器端缓存控制

## 开发指南

### 安装依赖

```bash
cd packages/web-astro
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建项目

```bash
pnpm build
```

### 预览构建结果

```bash
pnpm preview
```

## 配置说明

### 允许的域名配置

在 `src/config/allowedDomains.ts` 文件中配置允许被代理的域名白名单：

```typescript
// 允许的域名列表
export const allowedDomains = [
    'lilnong.top',
    'www.lilnong.top',
    'localhost',
    '127.0.0.1'
];

// 检查URL是否来自允许的域名
export function isAllowedDomain(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return allowedDomains.some(domain => 
            urlObj.hostname === domain || 
            urlObj.hostname.endsWith(`.${domain}`)
        );
    } catch {
        return false;
    }
}
```

### Astro 配置

在 `astro.config.mjs` 文件中配置 Astro 的行为：

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
    integrations: [
        react(),
        tailwind({
            applyBaseStyles: false,
        }),
    ],
    output: 'hybrid',
    adapter: node({
        mode: 'standalone',
    }),
    site: 'https://home-2025.lilnong.top',
    compressHTML: true,
    build: {
        inlineStylesheets: 'auto',
    },
});
```

### Tailwind 配置

在 `tailwind.config.mjs` 文件中配置 Tailwind CSS 的行为，包括：
- 主题定制
- 插件
- 内容路径 