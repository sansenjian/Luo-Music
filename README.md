# luo_music

基于 Vue 3 + Pinia + Electron 的音乐播放器

## 功能特性

### P0 核心功能
- ✅ 音乐播放控制（播放/暂停/上一曲/下一曲）
- ✅ 播放进度控制（进度条拖动/时间显示）
- ✅ 歌词实时同步显示（LRC 格式解析）
- ✅ 歌曲搜索（网易云音乐 API）
- ✅ 播放列表管理

### P1 增强功能
- ✅ 音量控制（持久化）
- ✅ 播放模式切换（顺序/循环/单曲/随机）
- ✅ 多层歌词支持（原文/翻译/罗马音）
- ✅ 歌词点击跳转
- ✅ 歌词自动滚动
- ✅ 响应式布局（桌面端/移动端适配）
- ✅ 桌面应用支持（Electron）

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4+ | 前端框架 |
| Electron | 40.0+ | 桌面应用框架 |
| Pinia | 2.1+ | 状态管理 |
| Pinia Plugin Persistedstate | 3.0+ | 状态持久化 |
| Axios | 1.6+ | HTTP 客户端 |
| Vite | 5.0+ | 构建工具 |
| NeteaseCloudMusicApi | 4.29+ | 音乐 API 服务 |

## 项目结构

```
luo_music/
├── electron/         # Electron 主进程代码
│   ├── main.js       # 主进程入口
│   └── preload.js    # 预加载脚本
├── src/
│   ├── api/          # API 接口层
│   ├── components/   # Vue 组件
│   ├── store/        # Pinia 状态管理
│   ├── utils/        # 工具函数
│   ├── views/        # 页面视图
│   ├── assets/       # 静态资源
│   ├── App.vue       # 根组件
│   └── main.js       # 入口文件
├── server.js         # 内置 API 服务入口
├── package.json
├── vite.config.js
└── index.html
```

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装依赖

```bash
cd luo_music
npm install
```

### 启动开发环境

推荐同时启动 API 服务和前端开发服务器：

```bash
npm start
```

或者分别启动：

```bash
# 终端 1：启动 API 服务 (端口 3000)
npm run server

# 终端 2：启动前端 (端口 5173)
npm run dev
```

### 构建应用

构建 Electron 桌面应用（Windows/Mac/Linux）：

```bash
npm run build
```

仅构建 Web 版本：

```bash
npm run build:web
```

## API 说明

本项目内置了网易云音乐 API 服务（基于 `NeteaseCloudMusicApi`），默认运行在 `http://localhost:3000`。
前端请求会自动代理到该地址。

无需额外克隆或配置 API 项目。

## 设计风格

采用工业风设计：
- **背景色**: 米白色 (#f5f5f0)
- **强调色**: 橙色 (#ff6b35)
- **边框**: 粗黑边框 (2px solid)
- **字体**: Inter + Noto Sans SC + JetBrains Mono

## 状态持久化

以下状态会自动持久化到 localStorage：
- `volume` - 音量设置
- `playMode` - 播放模式
- `lyricType` - 歌词显示类型
- `songList` - 播放列表
- `currentIndex` - 当前播放索引
- `isCompact` - 紧凑模式状态

## 参考资料

- [Hydrogen Music](https://github.com/Kaidesuyo/Hydrogen-Music) - 参考架构设计
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - 网易云音乐 API
- [Electron 文档](https://www.electronjs.org/)
- [Vue 3 文档](https://vuejs.org/)
