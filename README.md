# LUO Music Player

基于 Vue 3 + Pinia 的 Web 音乐播放器

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
- ✅ 响应式布局

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4+ | 前端框架 |
| Pinia | 2.1+ | 状态管理 |
| Pinia Plugin Persistedstate | 3.0+ | 状态持久化 |
| Axios | 1.6+ | HTTP 客户端 |
| Vite | 5.0+ | 构建工具 |

## 项目结构

```
luo_music/
├── src/
│   ├── api/              # API 接口层
│   │   ├── request.js    # Axios 封装
│   │   ├── search.js     # 搜索接口
│   │   └── song.js       # 歌曲接口
│   ├── components/       # Vue 组件
│   │   ├── Player.vue    # 播放器组件
│   │   ├── Lyric.vue     # 歌词组件
│   │   ├── Playlist.vue  # 播放列表组件
│   │   └── SearchInput.vue
│   ├── store/            # Pinia 状态管理
│   │   ├── pinia.js      # Pinia 配置
│   │   ├── playerStore.js
│   │   ├── playlistStore.js
│   │   └── searchStore.js
│   ├── utils/            # 工具函数
│   │   ├── lyric.js      # 歌词解析
│   │   └── player.js     # 播放器工具
│   ├── views/            # 页面视图
│   │   └── Home.vue      # 主页面
│   ├── assets/           # 静态资源
│   │   └── main.css      # 全局样式
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
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

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## API 配置

项目默认使用 `http://localhost:36530` 作为 API 地址（网易云音乐 API）。

### 启动网易云音乐 API

```bash
# 克隆 API 项目
git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git

# 安装依赖并启动
cd NeteaseCloudMusicApi
npm install
npm start
```

API 默认运行在 http://localhost:3000，可在 `src/utils/request.js` 中修改 `baseURL`。

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

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 参考资料

- [Hydrogen Music](https://github.com/Kaidesuyo/Hydrogen-Music) - 参考架构设计
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - 网易云音乐 API
- [Vue 3 文档](https://vuejs.org/)
- [Pinia 文档](https://pinia.vuejs.org/)

## 许可证

MIT License
