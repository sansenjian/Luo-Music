# 项目概览

LUO Music 是一个基于 Vue 3 + Pinia + Electron + TypeScript + TanStack Query 的现代化跨平台音乐播放器。

## 🎯 核心目标

打造一个美观、流畅、功能强大的双平台（网易云音乐 + QQ 音乐）音乐播放器，提供一致的用户体验。

## 🏗️ 架构概览

### 技术栈

- **前端框架**: Vue 3.7+ (Composition API)
- **构建工具**: Vite 7.0+
- **桌面框架**: Electron 40.0+
- **状态管理**: Pinia 3.0+ & TanStack Query 5.0+
- **语言**: TypeScript 5.0+
- **UI 组件**: Naive UI 2.43+
- **动画库**: Anime.js 4.0+
- **网络请求**: Axios 1.6+

### 目录结构

```
luo_music/
├── src/
│   ├── api/              # Axios 封装与 REST API
│   ├── assets/           # 静态资源
│   ├── components/       # Vue 组件
│   ├── composables/      # 组合式函数 (Vue Query Hooks)
│   ├── platform/         # 音乐平台适配层 (TypeScript)
│   │   ├── music/
│   │   │   ├── interface.ts # 统一接口定义
│   │   │   ├── netease.ts   # 网易云适配器
│   │   │   └── qq.ts        # QQ 音乐适配器
│   ├── router/           # 路由配置
│   ├── store/            # Pinia 状态管理
│   ├── utils/            # 工具函数
│   ├── views/            # 页面视图
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
├── electron/             # Electron 主进程
├── docs/                 # 文档目录
└── ...
```

## ✨ 主要特性

### 1. 双平台支持
通过统一的适配器模式 (`platform/music`)，实现了对网易云音乐和 QQ 音乐的无缝支持。
- **统一接口**: `MusicPlatformAdapter` 定义了标准化的操作。
- **自动切换**: 用户可以自由切换搜索源。
- **扫码登录**: 支持 QQ 音乐扫码登录获取 VIP 权限。

### 2. 现代化状态管理
- **Pinia**: 管理播放器状态（播放/暂停、进度、音量）、播放列表等客户端状态。
- **TanStack Query (Vue Query)**: 管理服务端状态（用户数据、歌单详情），提供自动缓存、去重和后台更新。

### 3. 极致的 UI/UX
- **流畅动画**: 基于 Anime.js 实现的微交互动画。
- **响应式设计**: 完美适配桌面端和不同尺寸的窗口。
- **紧凑模式**: 支持迷你播放器模式。
- **歌词系统**: 支持 LRC 格式解析、多层歌词（原文/翻译/罗马音）和高性能滚动。

### 4. 稳健的工程化
- **TypeScript**: 核心逻辑全面类型化，减少运行时错误。
- **单元测试**: 关键组件和 Store 拥有 Vitest 测试覆盖。
- **依赖分离**: `dependencies` (Web) 和 `devDependencies` (Electron) 分离，优化部署体积。

## 🚀 部署方案

- **Web 端**: 自动部署到 Vercel，使用 Serverless Function 代理 API。
- **桌面端**: 使用 Electron Builder 打包为 Windows/macOS/Linux 应用。

## 📈 发展路线

详见 [README.md](./index.md#🚀-开发计划) 中的开发计划。
