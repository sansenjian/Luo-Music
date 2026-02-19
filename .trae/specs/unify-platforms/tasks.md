# Tasks - 跨平台统一修复

## Task 1: Web 版本 CORS 和 API 配置修复
**Priority**: High
**Description**: 修复 Web 版本的 CORS 问题和 API 配置
- [x] SubTask 1.1: 修改 `src/api/request.js`，根据环境设置 `withCredentials`
- [x] SubTask 1.2: 修改 `src/utils/audioManager.js`，添加跨域属性设置
- [x] SubTask 1.3: 更新 `index.html`，优化 viewport 和字体加载

## Task 2: Electron 安全设置修复
**Priority**: High
**Description**: 修复 Electron 安全设置和 IPC 通信
- [x] SubTask 2.1: 修改 `electron/main.js`，启用 `webSecurity` 并添加协议处理
- [x] SubTask 2.2: 修改 `electron/preload.js`，改为 ES Module 语法
- [x] SubTask 2.3: 添加窗口尺寸验证和单实例锁
- [x] SubTask 2.4: 添加全局错误处理

## Task 3: Vercel Serverless Function 优化
**Priority**: High
**Description**: 优化 Vercel Serverless Function 性能
- [x] SubTask 3.1: 修改 `api/index.js`，禁用版本检查，添加错误处理
- [x] SubTask 3.2: 更新 `vercel.json`，添加 headers 和缓存配置
- [x] SubTask 3.3: 修改 `vite.config.js`，添加 Vercel 构建配置

## Task 4: 歌词解析修复
**Priority**: Medium
**Description**: 修复歌词时间戳解析问题
- [x] SubTask 4.1: 修改 `src/utils/lyric.js`，修复正则表达式支持冒号分隔符
- [x] SubTask 4.2: 优化多语言歌词匹配逻辑
- [x] SubTask 4.3: 改进歌词滚动同步性能

## Task 5: 状态管理优化
**Priority**: Medium
**Description**: 优化 Store 配置和依赖关系
- [x] SubTask 5.1: 修改 `src/store/playerStore.js`，添加音频错误重试逻辑
- [x] SubTask 5.2: 解决 `src/store/playlistStore.js` 循环依赖问题
- [x] SubTask 5.3: 优化 Store 持久化配置

## Task 6: 全局错误处理
**Priority**: Low
**Description**: 添加全局错误边界和错误处理
- [x] SubTask 6.1: 修改 `src/main.js`，添加 Vue 错误处理
- [x] SubTask 6.2: 添加未处理的 Promise 错误监听

## Task 7: 测试验证
**Priority**: High
**Description**: 验证所有修复是否正常工作
- [x] SubTask 7.1: 运行单元测试确保没有回归
- [x] SubTask 7.2: 测试 Web 版本功能
- [x] SubTask 7.3: 测试 Electron 版本功能
- [x] SubTask 7.4: 验证歌词解析正确性

# Task Dependencies
- Task 2 depends on Task 1 (API 配置)
- Task 3 depends on Task 1 (API 配置)
- Task 5 depends on Task 4 (歌词解析)
- Task 7 depends on all other tasks
