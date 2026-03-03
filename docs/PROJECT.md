# LUO Music - 项目概述

## 🎵 项目简介

LUO Music 是一个基于 **Vue 3 + Pinia + Electron** 的现代化跨平台音乐播放器，支持 **网易云音乐** 和 **QQ 音乐** 双平台。项目采用 Composition API 构建，具有优雅的界面设计和流畅的用户体验。

> ⚠️ **已知问题**：使用「沉浸式翻译」浏览器插件可能导致歌词不显示。如果遇到歌词不显示的问题，请尝试禁用该插件或将其加入白名单。

## 🚀 快速开始

### 3 步启动项目

**第 1 步：启动 API 服务**
```bash
# 打开新终端，进入 API 目录
cd NeteaseCloudMusicApi
PORT=36530 node app.js
```

**第 2 步：启动前端**
```bash
# 回到项目目录
npm run dev
```

**第 3 步：打开浏览器**
访问 `http://localhost:5173`

### 更多文档
- **快速安装**: [GETTING_STARTED.md](./GETTING_STARTED.md)
- **API 参考**: [api-documentation.md](./api-documentation.md)
- **组件文档**: [components-documentation.md](./components-documentation.md)

## 🎉 最新版本 (v2.0 - 2026-03-01)

### 新增功能
- ✅ **QQ 音乐平台支持** - 搜索、播放、歌词一站式体验
- ✅ **平台切换功能** - 搜索框旁可切换网易云/QQ 音乐
- ✅ **扫码登录 QQ 音乐** - 获取 VIP 歌曲播放权限
- ✅ **来源标识** - 歌曲名旁显示平台标签（红色=网易，绿色=QQ）
- ✅ **专辑封面显示** - 播放列表和播放器显示封面
- ✅ **优化 UI 设计** - 自定义下拉框、用户菜单美化

## 🚀 核心功能

### P0 核心功能
- ✅ **音乐播放控制** - 播放/暂停/上一曲/下一曲
- ✅ **进度控制** - 进度条拖动、时间显示
- ✅ **歌词同步** - LRC 格式解析、实时高亮
- ✅ **双平台搜索** - 网易云音乐 + QQ 音乐
- ✅ **播放列表** - 添加、删除、排序
- ✅ **平台切换** - 一键切换音乐源

### P1 增强功能
- ✅ **音量控制** - 持久化存储、精细拖动
- ✅ **播放模式** - 顺序/列表循环/单曲循环/随机播放
- ✅ **多层歌词** - 原文/翻译/罗马音支持
- ✅ **歌词交互** - 点击跳转、自动滚动
- ✅ **响应式设计** - 桌面端/移动端适配
- ✅ **Electron 桌面应用** - 跨平台支持
- ✅ **流畅动画** - 基于 Anime.js
- ✅ **QQ 音乐登录** - 扫码获取 VIP 权限
- ✅ **专辑封面** - 高清封面展示
- ✅ **登录状态检测** - 自动识别登录状态

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue** | 3.5+ | 前端框架（Composition API） |
| **Electron** | 33.0+ | 桌面应用框架 |
| **Pinia** | 3.0+ | 状态管理（Vuex 替代方案） |
| **Pinia Persistedstate** | 4.7+ | 状态持久化插件 |
| **Axios** | 1.6+ | HTTP 客户端 |
| **Vite** | 7.0+ | 构建工具 |
| **Anime.js** | 4.0+ | 动画效果库 |
| **VueUse** | 14.2+ | Vue 组合式工具库 |
| **Naive UI** | 2.43+ | UI 组件库 |
| **NeteaseCloudMusicApi Enhanced** | 4.30+ | 网易云音乐 API（增强版） |
| **QQ Music API** | 1.0.6+ | QQ 音乐 API 服务 |

## 📦 项目架构

```
luo_music/
├── api/                  # Vercel Serverless Function
│   └── index.js          # API 入口
├── electron/             # Electron 主进程
│   ├── main.js           # 主进程入口
│   └── preload.cjs       # 预加载脚本
├── src/
│   ├── api/              # API 接口层
│   │   ├── qqmusic.js    # QQ 音乐 API
│   │   ├── search.js     # 搜索 API
│   │   ├── song.js       # 歌曲 API
│   │   └── request.js    # 请求封装
│   ├── assets/           # 静态资源
│   │   ├── main.css      # 全局样式
│   │   └── components/   # 组件样式
│   ├── components/       # Vue 组件
│   │   ├── Player.vue    # 播放器
│   │   ├── Lyric.vue     # 歌词
│   │   ├── Playlist.vue  # 播放列表
│   │   ├── SearchInput.vue  # 搜索框
│   │   ├── UserAvatar.vue   # 用户头像
│   │   └── QQLoginModal.vue # QQ 登录
│   ├── composables/      # 组合式函数
│   │   ├── useAnimations.js   # 动画
│   │   ├── useLikedSongs.js   # 收藏
│   │   └── useSearch.js       # 搜索
│   ├── router/           # 路由配置
│   │   └── index.js      # 路由定义
│   ├── store/            # Pinia Store
│   │   ├── playerStore.js    # 播放器状态
│   │   ├── searchStore.js    # 搜索状态
│   │   ├── playlistStore.js  # 播放列表
│   │   ├── userStore.js      # 用户状态
│   │   └── toastStore.js     # 消息提示
│   ├── utils/            # 工具函数
│   │   └── player/       # 播放器模块
│   │       ├── core/     # 核心模块
│   │       ├── helpers/  # 辅助函数
│   │       ├── modules/  # 功能模块
│   │       └── constants/# 常量定义
│   ├── views/            # 页面视图
│   │   ├── Home.vue      # 主页
│   │   └── UserCenter.vue# 用户中心
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
├── server.js             # 本地 API 服务
├── package.json          # 项目配置
├── vite.config.js        # Vite 配置
└── index.html            # HTML 模板
```

## 🌐 支持平台

### Web 浏览器
- ✅ Chrome / Edge
- ✅ Firefox
- ✅ Safari

### 桌面应用
- ✅ Windows (10/11)
- ✅ macOS (10.13+)
- ✅ Linux (Ubuntu/Debian)

## 🎨 设计风格

采用**工业风**设计语言：

- **背景色**: 米白色 (#f5f5f0)
- **强调色**: 橙色 (#ff6b35)
- **边框**: 粗黑边框 (2px solid)
- **字体**: 
  - 西文：Inter
  - 中文：Noto Sans SC
  - 代码：JetBrains Mono

## 📊 性能指标

- **首屏加载**: < 2s
- **搜索响应**: < 500ms
- **歌词同步**: 200ms 轮询
- **内存占用**: < 200MB (Web) / < 300MB (Electron)

## 🔧 环境支持

| 环境 | 适用场景 | API 服务 | 部署方式 |
|------|----------|----------|----------|
| **Web 开发** | 本地开发调试 | 本地 Node.js (端口 14532) | `npm run dev` |
| **Electron 桌面** | Windows/Mac/Linux | 内置/本地服务 | `npm run dev:electron` |
| **Vercel 线上** | 线上 Web 访问 | Vercel Serverless | 自动部署 |

## 📈 开发路线图

### 已完成 ✅
- [x] 进度条拖动实时追踪歌词
- [x] 升级 Vite 到 v7 版本
- [x] 升级 Vue 到 v3.5 版本
- [x] 双平台搜索支持
- [x] QQ 音乐扫码登录
- [x] 播放列表专辑封面
- [x] 自定义平台选择下拉框
- [x] 用户头像下拉菜单优化
- [x] 重构 playerStore 消除上帝类
- [x] 优化歌词滚动性能

### 进行中 🚧
- [ ] 消除翻译歌词不显示问题（QQ 音乐数据源限制）
- [ ] 修复录屏/截图白屏问题

### 计划中 📋
- [ ] 用户登录系统
- [ ] 收藏功能
- [ ] 播放历史
- [ ] 歌单管理
- [ ] MV 播放
- [ ] 评论功能
- [ ] 分享功能
- [ ] 桌面歌词
- [ ] 全局快捷键
- [ ] 主题切换

## 📚 文档导航

- [快速开始](./GETTING_STARTED.md) - 安装、配置、运行
- [API 文档](./api-documentation.md) - 完整的 API 端点说明
- [组件文档](./components-documentation.md) - Vue 组件使用指南
- [项目结构](./FILES.md) - 文件组织和架构
- [分析报告](./analysis-report.md) - 代码质量分析

## 🔗 相关链接

- [GitHub 仓库](https://github.com/sansenjian/luo_music)
- [网易云音乐 API](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
- [QQ 音乐 API](https://github.com/sansenjian/qq-music-api)
- [Vue 3 文档](https://vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)

## 💖 支持开发

如果这个项目帮到了你，可以考虑赞助支持：

**API 作者 (sansenjian)**：
- [爱发电 - @sansenjian](https://ifdian.net/a/sansenjian)

你的支持将用于：
- 维护网易云/QQ 音乐 API 接口
- 开发更多功能
- 持续优化播放器体验

## 📄 许可证

MIT License

---

**当前版本**: v2.0  
**最后更新**: 2026-03-01  
**开发者**: LUO & sansenjian
