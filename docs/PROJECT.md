# LUO Music - 项目文档

## 项目概述

LUO Music 是一个基于 Vue 3 + Pinia 的现代音乐播放器，参考 Hydrogen Music 的技术架构。

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **状态管理**: Pinia
- **HTTP 客户端**: Axios
- **构建工具**: Vite
- **音频播放**: 原生 Audio API
- **后端 API**: NeteaseCloudMusicApi (本地服务)

## 项目结构

```
luo_music/
├── src/
│   ├── api/              # API 接口
│   │   ├── song.js       # 歌曲相关 API
│   │   ├── search.js     # 搜索相关 API
│   │   └── playlist.js   # 歌单相关 API
│   ├── assets/           # 静态资源
│   │   ├── main.css      # 全局样式
│   │   └── components/   # 组件样式
│   ├── components/       # Vue 组件
│   │   ├── Player.vue    # 播放器组件
│   │   ├── Lyric.vue     # 歌词组件
│   │   ├── Playlist.vue  # 播放列表组件
│   │   └── Search.vue    # 搜索组件
│   ├── store/            # Pinia Store
│   │   └── playerStore.js # 播放器状态管理
│   ├── utils/            # 工具函数
│   │   ├── request.js    # Axios 封装
│   │   └── lyric.js      # 歌词解析工具
│   ├── views/            # 页面视图
│   │   └── Home.vue      # 主页
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
├── index.html            # HTML 模板
├── vite.config.js        # Vite 配置
└── package.json          # 项目配置

```

## 核心功能

### 1. 音乐播放
- ✅ 播放/暂停
- ✅ 上一曲/下一曲
- ✅ 进度条控制
- ✅ 音量控制
- ✅ 播放模式切换（顺序/循环/单曲/随机）

### 2. 歌词显示
- ✅ LRC 格式解析
- ✅ 三层歌词支持（原文+翻译+罗马音）
- ✅ 实时同步高亮
- ✅ 点击歌词跳转
- ✅ 歌词滚动

### 3. 搜索功能
- ✅ 关键词搜索
- ✅ 搜索建议
- ✅ 热搜榜单

### 4. 播放列表
- ✅ 歌曲列表显示
- ✅ 当前播放高亮
- ✅ 点击播放

## API 接口

### 基础配置
- **Base URL**: `http://localhost:36530`
- **需要本地运行**: NeteaseCloudMusicApi

### 主要接口

#### 歌曲相关
- `GET /lyric?id={id}` - 获取歌词
- `GET /song/url/v1?id={id}&level={level}` - 获取音乐 URL
- `GET /song/detail?ids={ids}` - 获取歌曲详情
- `GET /check/music?id={id}` - 检查音乐可用性

#### 搜索相关
- `GET /cloudsearch?keywords={keywords}&type=1` - 搜索歌曲
- `GET /search/suggest?keywords={keywords}` - 搜索建议
- `GET /search/hot/detail` - 热搜列表

#### 歌单相关
- `GET /personalized?limit={limit}` - 推荐歌单
- `GET /playlist/detail?id={id}` - 歌单详情
- `GET /playlist/track/all?id={id}` - 歌单所有歌曲

## 歌词解析

### 支持格式
- LRC 标准格式: `[mm:ss.ms]歌词内容`
- 三层歌词:
  - `lrc.lyric` - 原文歌词
  - `tlyric.lyric` - 翻译歌词
  - `romalrc.lyric` - 罗马音歌词

### 解析流程
1. 获取歌词 API 响应
2. 分离三层歌词文本
3. 按行分割并解析时间戳
4. 通过时间戳匹配合并三层歌词
5. 按时间排序生成歌词数组

### 实时同步
- 轮询间隔: 200ms
- 提前量: 0.2 秒
- 高亮策略: 当前时间 + 0.2s 匹配歌词时间

## 开发指南

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 前置要求

### 1. 安装 NeteaseCloudMusicApi
```bash
git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git
cd NeteaseCloudMusicApi
npm install
node app.js
```

默认端口: 3000
如需修改端口为 36530:
```bash
PORT=36530 node app.js
```

### 2. 配置 API 地址
如果 API 端口不是 36530，修改 `src/utils/request.js`:
```javascript
baseURL: 'http://localhost:YOUR_PORT'
```

## 设计理念

### 视觉风格
- 简洁现代的界面设计
- 柔和的配色方案
- 流畅的动画过渡
- 响应式布局

### 用户体验
- 直观的操作逻辑
- 快速的响应速度
- 友好的错误提示
- 流畅的交互动画

## 待实现功能

- [ ] 用户登录
- [ ] 收藏功能
- [ ] 播放历史
- [ ] 歌单管理
- [ ] MV 播放
- [ ] 评论功能
- [ ] 分享功能
- [ ] 桌面歌词
- [ ] 快捷键支持
- [ ] 主题切换

## 参考项目

- [Hydrogen Music](https://github.com/Kaidesuyo/Hydrogen-Music) - 主要参考
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - API 服务

## 许可证

MIT License

---

**开发者**: LUO
**版本**: 0.1.0
**更新时间**: 2026-02-16
