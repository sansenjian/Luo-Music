# luo_music

基于 Vue 3 + Pinia + Electron 的跨平台音乐播放器

> ⚠️ **已知问题**：使用「沉浸式翻译」浏览器插件可能导致歌词不显示。如果遇到歌词不显示的问题，请尝试禁用该插件或将其加入白名单。

## 🚀 开发计划

- [ ] 进度条拖动时实时追踪歌词
- [ ] 升级 Vite 到 v7 版本
- [ ] 升级 Vue 到 v3.5 版本

## 功能特性

### P0 核心功能
- ✅ 音乐播放控制（播放/暂停/上一曲/下一曲）
- ✅ 播放进度控制（进度条拖动/时间显示）
- ✅ 歌词实时同步显示（LRC 格式解析）
- ✅ 歌曲搜索（网易云音乐 API）
- ✅ 播放列表管理

### P1 增强功能
- ✅ 音量控制（持久化、支持拖动）
- ✅ 播放模式切换（顺序/循环/单曲/随机）
- ✅ 多层歌词支持（原文/翻译/罗马音）
- ✅ 歌词点击跳转
- ✅ 歌词自动滚动（二分查找优化）
- ✅ 响应式布局（桌面端/移动端适配）
- ✅ 桌面应用支持（Electron）
- ✅ 按钮动画效果（Anime.js）
- ✅ 进度条拖动定位
- ✅ Web 浏览器支持（Chrome/Edge/Firefox）

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4+ | 前端框架 |
| Electron | 40.0+ | 桌面应用框架 |
| Pinia | 2.1+ | 状态管理 |
| Pinia Plugin Persistedstate | 3.0+ | 状态持久化 |
| Axios | 1.6+ | HTTP 客户端 |
| Vite | 5.0+ | 构建工具 |
| Anime.js | 4.0+ | 动画效果 |
| NeteaseCloudMusicApi | 4.29+ | 音乐 API 服务 |

## 项目结构

```
luo_music/
├── api/              # Vercel Serverless Function
│   └── index.js      # API 入口
├── electron/         # Electron 主进程代码
│   ├── main.js       # 主进程入口
│   └── preload.cjs   # 预加载脚本
├── public/           # 静态资源
│   └── favicon.svg   # 网站图标
├── scripts/          # 构建脚本
│   └── dev-electron.js
├── src/
│   ├── api/          # API 接口层
│   ├── assets/       # 静态资源（CSS）
│   ├── components/   # Vue 组件
│   ├── composables/  # 组合式函数
│   ├── router/       # 路由配置
│   ├── store/        # Pinia 状态管理
│   ├── utils/        # 工具函数
│   ├── views/        # 页面视图
│   ├── App.vue       # 根组件
│   └── main.js       # 入口文件
├── test/             # 测试文件
│   ├── e2e/          # 端到端测试
│   ├── integration/  # 集成测试
│   └── unit/         # 单元测试
├── server.js         # 本地 API 服务入口
├── package.json
├── vite.config.js
├── vercel.json       # Vercel 部署配置
└── index.html
```

## 环境支持

本项目支持三种运行环境：

| 环境 | 适用场景 | API 服务 | 部署方式 |
|------|----------|----------|----------|
| **Web 开发** | 本地开发调试（Chrome/Edge/Firefox） | 本地 Node.js 服务 | `npm run dev` |
| **Electron 桌面** | Windows/Mac/Linux 桌面应用 | 内置/本地服务 | `npm run dev` 或 `npm run dev:electron` |
| **Vercel 线上** | 线上 Web 访问 | Vercel Serverless Function | 自动部署 |

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装依赖

```bash
cd luo_music
npm install
```

---

## 🌐 Web 开发环境

### 启动开发服务器

需要同时启动 API 服务和前端开发服务器：

**方式一：使用单个命令（推荐）**
```bash
npm start
```

**方式二：分别启动（调试时使用）**
```bash
# 终端 1：启动 API 服务 (端口 14532)
npm run server

# 终端 2：启动前端开发服务器 (端口 5173)
npm run dev
```

### 构建 Web 版本

```bash
npm run build:web
```

构建输出目录：`dist/`

---

## 💻 Electron 桌面环境

### 开发模式

```bash
# 同时启动 API 服务和 Electron 应用
npm run dev
# 或者
npm run dev:electron
```

### 构建桌面应用

```bash
# 构建当前平台
npm run build

# 使用 electron-builder 直接构建指定平台
npx electron-builder --win
npx electron-builder --mac
npx electron-builder --linux
```

构建输出目录：`dist-electron/`

### Electron 特性

- **窗口控制**：支持最小化、最大化、关闭
- **紧凑模式**：按 ESC 键切换迷你播放器
- **系统托盘**：最小化到托盘
- **全局快捷键**：支持媒体键控制

---

## ☁️ Vercel 线上部署

### 自动部署

1. Fork 本项目到 GitHub
2. 在 Vercel 导入项目
3. 配置环境变量（可选）：
   - `VITE_API_BASE_URL` - API 基础 URL（默认使用 Vercel Serverless Function）
4. 部署完成

### Vercel 配置说明

项目已配置好 `vercel.json`，包含：
- API 路由重写（`/api/*` → Serverless Function）
- CORS 跨域支持
- 静态资源缓存策略
- 10 秒函数执行时间限制

### 本地预览 Vercel 构建

```bash
# 安装 Vercel CLI
npm i -g vercel

# 本地预览
vercel dev
```

---

## ⚙️ 环境变量配置

创建 `.env` 文件（开发环境）：

```bash
# API 基础 URL
# Web 开发：http://localhost:14532
# Vercel 部署：/api（使用相对路径）
VITE_API_BASE_URL=http://localhost:14532

# 开发服务器端口
VITE_DEV_SERVER_PORT=5173
```

---

## 🔌 API 说明

### 本地开发

内置网易云音乐 API 服务（基于 `NeteaseCloudMusicApi`），默认运行在 `http://localhost:14532`。

### Vercel 部署

使用 Serverless Function 运行 API，路径为 `/api/*`。

### 主要 API 端点

| 端点 | 说明 |
|------|------|
| `/search` | 歌曲搜索 |
| `/song/url` | 获取音乐 URL |
| `/lyric` | 获取歌词 |
| `/playlist/detail` | 歌单详情 |

---

## 🎨 设计风格

采用工业风设计：
- **背景色**: 米白色 (#f5f5f0)
- **强调色**: 橙色 (#ff6b35)
- **边框**: 粗黑边框 (2px solid)
- **字体**: Inter + Noto Sans SC + JetBrains Mono

---

## 💾 状态持久化

以下状态会自动持久化到 localStorage：
- `volume` - 音量设置
- `playMode` - 播放模式
- `lyricType` - 歌词显示类型
- `isCompact` - 紧凑模式状态

**注意**：播放列表和当前索引不持久化，避免 URL 过期问题。

---

## 🐛 常见问题

### Q: 搜索提示 "Search failed. Please check your connection"
**A**: 检查 API 服务是否启动：`npm run server`

### Q: 歌词不显示
**A**: 歌词解析支持标准 LRC 格式，包括 `[00:00.00]` 和 `[00:00:00]` 两种时间戳格式

### Q: Electron 应用无法播放音乐
**A**: 检查 `webSecurity` 设置，确保音频跨域配置正确

### Q: Vercel 部署后 API 超时
**A**: Vercel 免费版函数执行时间限制为 10 秒，部分 API 可能需要重试

---

## 📚 参考资料

- [Hydrogen Music](https://github.com/Kaidesuyo/Hydrogen-Music) - 参考架构设计
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - 网易云音乐 API
- [Electron 文档](https://www.electronjs.org/)
- [Vue 3 文档](https://vuejs.org/)
- [Vercel 文档](https://vercel.com/docs)
