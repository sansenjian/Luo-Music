# luo_music 跨平台统一修复 Spec

## Why

luo_music 项目需要同时支持 Web、Electron 桌面和 Vercel 部署三种运行环境。当前代码存在多个平台兼容性问题，包括：
- Web 版本的 CORS 和 API 配置问题
- Electron 版本的安全设置和 IPC 通信问题
- Vercel Serverless Function 的性能和配置问题
- 歌词解析的时间戳格式兼容性问题
- 状态管理的持久化和同步问题

## What Changes

### 1. Web 版本修复
- **BREAKING**: 修改 API 请求配置，解决 CORS 问题
- 添加音频跨域属性设置
- 优化字体加载策略
- 改进移动端 viewport 配置

### 2. Electron 版本修复
- **BREAKING**: 移除 `webSecurity: false`，改为安全的跨域处理方式
- 修复预加载脚本的模块化问题
- 添加窗口尺寸验证和限制
- 实现单实例锁和全局错误处理

### 3. Vercel 部署修复
- 优化 Serverless Function 初始化逻辑
- 添加请求超时和错误处理
- 完善路由重写和 CORS 配置
- 添加静态资源缓存策略

### 4. 歌词解析修复
- 修复时间戳正则表达式，支持冒号和点号两种分隔符
- 优化多语言歌词匹配逻辑
- 改进歌词滚动同步性能

### 5. 状态管理优化
- 优化 Store 持久化配置
- 解决 Store 间循环依赖问题
- 添加音频错误重试逻辑

## Impact

- 受影响文件：
  - `src/api/request.js`
  - `src/utils/audioManager.js`
  - `src/utils/lyric.js`
  - `electron/main.js`
  - `electron/preload.js`
  - `api/index.js`
  - `vercel.json`
  - `vite.config.js`
  - `src/store/playerStore.js`
  - `src/store/playlistStore.js`
  - `src/components/Lyric.vue`
  - `index.html`

## ADDED Requirements

### Requirement: Web 版本 CORS 支持
The system SHALL handle CORS properly in web environment.

#### Scenario: API request in browser
- **WHEN** the app runs in browser
- **THEN** API requests should not fail due to CORS
- **AND** audio playback should work with cross-origin resources

### Requirement: Electron Security
The system SHALL run Electron with security enabled.

#### Scenario: Electron app startup
- **WHEN** the Electron app starts
- **THEN** webSecurity should be enabled
- **AND** cross-origin requests should use safe proxy method

### Requirement: Vercel Performance
The system SHALL handle Serverless Function cold start efficiently.

#### Scenario: API request on Vercel
- **WHEN** a request hits the Vercel API
- **THEN** it should respond within 10 seconds
- **AND** should not check version on every cold start

### Requirement: Lyric Timestamp Compatibility
The system SHALL parse lyrics with both colon and dot millisecond separators.

#### Scenario: Parse lyrics with colon timestamps
- **GIVEN** lyrics with timestamps like `[00:00:79]`
- **WHEN** parsing the lyrics
- **THEN** it should correctly parse the time

## MODIFIED Requirements

### Requirement: API Request Configuration
**Current**: Uses `withCredentials: true` and hardcoded localhost URL
**Modified**: Uses environment-based URL and disables credentials for web

### Requirement: Electron Window Management
**Current**: No validation on window resize, uses `webSecurity: false`
**Modified**: Validates dimensions, enables security, uses protocol handlers

### Requirement: Lyric Parsing
**Current**: Only supports dot separator in timestamps
**Modified**: Supports both dot and colon separators

## REMOVED Requirements

### Requirement: Unsafe Electron Configuration
**Reason**: `webSecurity: false` is a security risk
**Migration**: Use protocol handlers or proxy for cross-origin requests
