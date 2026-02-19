# Checklist - 跨平台统一修复

## Web 版本修复
- [x] `src/api/request.js` 根据环境正确设置 `withCredentials`
- [x] `src/utils/audioManager.js` 在 Web 环境下设置 `crossOrigin = 'anonymous'`
- [x] `index.html` viewport 配置移除 `maximum-scale` 和 `user-scalable=no`
- [x] `index.html` 添加字体预连接和 fallback

## Electron 版本修复
- [x] `electron/main.js` 启用 `webSecurity: true`
- [x] `electron/main.js` 添加窗口尺寸验证（MIN_WIDTH: 400, MIN_HEIGHT: 80）
- [x] `electron/main.js` 实现单实例锁
- [x] `electron/main.js` 添加全局错误处理（uncaughtException, unhandledRejection）
- [x] `electron/preload.js` 改为 ES Module 语法（使用 `import` 替代 `require`）
- [x] `electron/preload.js` 添加有效的 IPC 通道白名单验证

## Vercel 部署修复
- [x] `api/index.js` 禁用 `checkVersion: true`
- [x] `api/index.js` 添加并发初始化保护
- [x] `api/index.js` 添加请求超时处理
- [x] `api/index.js` 添加错误处理和 500 响应
- [x] `vercel.json` 添加 CORS headers 配置
- [x] `vercel.json` 添加静态资源缓存策略
- [x] `vercel.json` 添加 `functions.maxDuration` 配置
- [x] `vite.config.js` 添加 Vercel 环境检测
- [x] `vite.config.js` 配置正确的 `base` 路径

## 歌词解析修复
- [x] `src/utils/lyric.js` 正则表达式支持冒号和点号分隔符
- [x] `src/utils/lyric.js` `formatLyricTime` 正确处理冒号分隔符
- [x] `src/utils/lyric.js` 多语言歌词匹配使用 Map 替代数组遍历
- [x] `src/components/Lyric.vue` 使用 requestAnimationFrame 优化滚动

## 状态管理优化
- [x] `src/store/playerStore.js` 添加音频错误重试逻辑
- [x] `src/store/playerStore.js` 使用节流处理 timeupdate 事件
- [x] `src/store/playlistStore.js` 解决与 playerStore 的循环依赖
- [x] Store 持久化添加数据验证和恢复逻辑

## 全局错误处理
- [x] `src/main.js` 添加 Vue 全局错误处理
- [x] `src/main.js` 添加未处理 Promise 错误监听

## 测试验证
- [x] 所有单元测试通过（`npm run test:run`）
- [x] Web 版本搜索和播放功能正常
- [x] Web 版本歌词显示和同步正常
- [x] Electron 版本窗口控制正常（最小化、最大化、关闭）
- [x] Electron 版本 ESC 切换紧凑模式正常
- [x] Vercel 构建成功
- [x] 歌词解析支持 `[00:00.00]` 和 `[00:00:00]` 两种格式
