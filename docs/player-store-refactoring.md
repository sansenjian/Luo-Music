# Player Store 重构报告

## 概述

将原本 580 行的 `playerStore.ts` 拆分为四个独立模块，每个模块遵循单一职责原则。

## 重构前后对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| playerStore.ts 行数 | ~580 行 | ~380 行 |
| 模块数量 | 1 个单体文件 | 4 个独立模块 |
| 职责分离 | 混合 | 清晰分离 |
| 可测试性 | 低 | 高 |
| 可维护性 | 低 | 高 |

## 新模块结构

```
src/store/player/
├── playerState.ts       # 纯状态定义（118 行）
├── audioEvents.ts       # 音频事件处理（203 行）
├── playbackActions.ts   # 播放业务逻辑（220 行）
├── ipcHandlers.ts       # IPC 通信处理（160 行）
├── index.ts             # 统一导出
└── README.md            # 本文档
```

## 各模块职责

### 1. playerState.ts - 状态定义

**职责**：定义播放器状态接口和初始状态工厂函数

**特点**：
- 纯粹的接口和类型定义
- 不包含任何业务逻辑
- 导出 `createInitialState()` 工厂函数
- 导出 `PLAY_MODE_TEXTS` 常量

**VSCode 设计借鉴**：
- 状态与行为分离（State-Behavior Separation）
- 单一数据源（Single Source of Truth）

### 2. audioEvents.ts - 音频事件处理

**职责**：管理 HTMLAudioElement 的所有事件监听

**核心类**：
- `AudioEventHandler` - 事件处理器，使用 Disposable 模式

**特点**：
- 自动资源释放（Disposable 模式）
- 节流逻辑避免频繁更新 UI
- 支持动态更新回调函数
- 防止 HMR 导致的事件累积

**VSCode 设计借鉴**：
- Disposable 模式实现资源自动释放
- 事件订阅发布模式

### 3. playbackActions.ts - 播放业务逻辑

**职责**：处理播放相关的核心业务逻辑

**核心类**：
- `PlaybackActions` - 播放动作处理器

**主要方法**：
- `playSongWithDetails()` - 播放歌曲（含 URL 获取和歌词加载）
- `playPrev()` / `playNext()` - 播放导航
- `getRandomIndex()` - 随机播放逻辑
- `playNextSkipUnavailable()` - 跳过不可用歌曲

**特点**：
- 依赖注入模式
- 错误处理逻辑封装
- 自动跳过失败歌曲

**VSCode 设计借鉴**：
- 命令模式（Command Pattern）
- 依赖注入（Dependency Injection）

### 4. ipcHandlers.ts - IPC 通信处理

**职责**：处理与 Electron 主进程的 IPC 通信

**核心类**：
- `IpcHandlers` - IPC 通信处理器
- `IpcEventHandler` - IPC 事件处理器

**监听的 IPC 通道**：
- `music-playing-control` - 播放/暂停控制
- `music-song-control` - 上一首/下一首
- `music-playmode-control` - 播放模式切换
- `music-volume-up/down` - 音量控制
- `music-process-control` - 快进/快退
- `music-compact-mode-control` - 紧凑模式切换
- `hide-player` - 隐藏播放器

**特点**：
- 统一的资源管理
- 自动清理监听器
- 防止重复初始化

**VSCode 设计借鉴**：
- IPC 通道模式
- 事件监听器生命周期管理

## 依赖注入模式

所有模块都使用依赖注入而非直接依赖 store 实例：

```typescript
// PlaybackActions 的依赖接口
interface PlaybackActionsDeps {
  getState: () => PlayerState
  onStateChange: (changes: Partial<PlayerState>) => void
  playSongByIndex: (index: number) => Promise<void>
  setLyricsArray: (lyrics: LyricLine[]) => void
  createErrorHandler: () => PlaybackErrorHandler
  getErrorHandler: () => PlaybackErrorHandler | null
  platform: { isElectron: () => boolean }
}
```

**优点**：
- 模块可独立测试
- 减少循环依赖
- 清晰的接口边界

## 资源管理

使用 Disposable 模式确保资源正确释放：

```typescript
interface IDisposable {
  dispose(): void
}

class AudioEventHandler {
  private _eventDisposables: IDisposable[] = []

  dispose(): void {
    for (const d of this._eventDisposables) {
      d.dispose()
    }
    this._eventDisposables = []
  }
}
```

**资源清理时机**：
- 组件卸载时
- 清理播放列表时
- HMR 热更新时

## 迁移清单

### 已完成
- [x] 创建 `playerState.ts` - 纯状态定义
- [x] 创建 `audioEvents.ts` - 音频事件处理
- [x] 创建 `playbackActions.ts` - 播放业务逻辑
- [x] 创建 `ipcHandlers.ts` - IPC 通信处理
- [x] 重构 `playerStore.ts` 使用新模块
- [x] 类型检查通过
- [x] 所有测试通过（307 个）

### 待处理（高优先级）
- [ ] 统一适配层（src/api/ vs src/platform/music/）
- [ ] 统一错误处理（utils/error/ vs services/errorService.ts）
- [ ] 统一 IPC 通道定义

## 测试结果

```
Test Files  28 passed (28)
     Tests  307 passed (307)
Duration  7.44s
```

## 下一步

继续重构其他高优先级问题：

1. **统一适配层** - 合并 `src/api/` 和 `src/platform/music/` 的重复代码
2. **统一错误处理** - 整合 `utils/error/` 和 `services/errorService.ts`
3. **统一 IPC 通道** - 集中管理所有 IPC 通道定义
