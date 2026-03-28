# 歌词系统重构过程说明

## 当前进度

- Phase 1 已完成：歌词领域入口统一到 `src/utils/player/core/lyric.ts`，`src/utils/player/lyric-parser.ts` 仅保留兼容桥接与测试覆盖
- Phase 2 已完成：歌词索引同步与 IPC 广播统一收敛到 `src/store/player/lyricSync.ts`
- Phase 3 已完成：`useActiveLyricState` 只负责聚合视图状态，IPC hydration / push 时序收敛到 `src/composables/useIpcActiveLyricState.ts`
- Phase 4 已完成：主进程歌词缓存显式绑定所属歌曲，桌面歌词窗口 ready / replay 顺序补齐测试并收紧行为
- Phase 5 已完成：移除 `src/utils/index.ts` 对遗留歌词兼容 API 的聚合导出，并补充执行记录

## 当前模块边界

- 领域层：`src/utils/player/core/lyric.ts`
- 兼容层：`src/utils/player/lyric-parser.ts`
- Store 同步层：`src/store/player/lyricSync.ts`
- Web 渲染层：`src/components/LyricDisplay.vue`、`src/composables/useLyricAutoScroll.ts`
- Desktop 状态层：`src/composables/useIpcActiveLyricState.ts`
- Desktop 窗口控制层：`src/components/LyricFloat.vue`
- Electron 主进程：`electron/DesktopLyricManager.ts`、`electron/ipc/handlers/player.handler.ts`、`electron/ipc/handlers/lyric.handler.ts`

## 1. 目标与原则

### 目标

在不改变用户可见行为的前提下，重构歌词系统，降低跨层耦合，提升可维护性与可测试性。

### 原则

- 行为优先：先保证行为一致，再优化结构
- 小步提交：每个阶段可独立回滚
- 边界清晰：解析、状态、UI、IPC 各层职责单一
- 测试先行：高风险变更先补回归测试再改实现

## 2. 当前边界与风险

当前歌词链路横跨以下模块：

- 解析与引擎：`src/utils/player/core/lyric.ts`
- 旧兼容工具：`src/utils/player/lyric-parser.ts`
- 播放状态与同步：`src/store/playerStore.ts`、`src/store/player/playbackActions.ts`、`src/store/player/audioEvents.ts`
- 页面歌词与滚动：`src/components/LyricDisplay.vue`、`src/composables/useLyricAutoScroll.ts`
- 桌面歌词与 IPC：`src/components/LyricFloat.vue`、`src/composables/useActiveLyricState.ts`、`electron/DesktopLyricManager.ts`、`electron/ipc/handlers/lyric.handler.ts`

主要风险点：

- 歌词拉取并发导致旧请求覆盖新状态
- 播放进度与歌词索引同步的节流/时序回归
- 桌面歌词窗口 ready 握手与缓存回放顺序
- 自动滚动中用户滚动与程序滚动的状态冲突

## 3. 重构范围

### In Scope

- 统一歌词领域模型（`LyricLine`、解析输出格式）
- 统一歌词同步入口（索引更新、IPC 广播）
- 收敛桌面歌词渲染与主进程通信边界
- 清理重复/遗留歌词工具导出

### Out of Scope

- 更换音乐平台 API 协议
- 改造非歌词播放器能力（下载、登录、推荐）
- 桌面歌词视觉大改

## 4. 分阶段执行计划

## Phase 0: 建基线（必须）

### 工作项

- 冻结当前歌词行为（功能与关键时序）
- 补齐缺失回归用例（仅补，不重构）
- 记录基线命令结果

### 验收

```bash
npm run test:run -- tests/utils/player/lyric.test.ts
npm run test:run -- tests/store/player/playbackActions.test.ts
npm run test:run -- tests/store/player/audioEvents.test.ts
npm run test:run -- tests/components/LyricDisplay.test.ts
npm run test:run -- tests/components/LyricFloat.test.ts
npm run test:run -- tests/electron/DesktopLyricManager.test.ts
```

## Phase 1: 领域层收敛（Parser + Engine）

### 工作项

- 确定单一歌词领域入口（建议保留 `core/lyric.ts`）
- 处理 `src/utils/player/lyric-parser.ts` 兼容策略：
- 仅保留桥接导出，避免新逻辑继续依赖旧实现
- 标注弃用路径与迁移截止时间
- 统一时间戳解析与多语言字段合并规则

### 验收

- `LyricParser`、`LyricEngine` 单测全部通过
- 不新增 `lyric-parser.ts` 新引用

## Phase 2: Store 层拆分与同步统一

### 工作项

- 从 `playerStore.ts` 抽离歌词同步逻辑到独立模块（建议 `src/store/player/lyricSync.ts`）
- 统一以下逻辑入口：
- 歌词数组设置
- 当前歌词索引同步
- `lyric-time-update` 广播触发
- 保持 `playbackActions.ts` 的请求竞争保护策略（`lyricRequestId`）

### 验收

```bash
npm run test:run -- tests/store/player/playbackActions.test.ts
npm run test:run -- tests/store/player/audioEvents.test.ts
npm run test:run -- tests/store/playerStore.lifecycle.test.ts
npm run test:run -- tests/store/playerStore.test.ts
```

## Phase 3: 渲染层收敛（Web + Desktop）

### 工作项

- 约束 `useActiveLyricState` 只做状态聚合，不继续吸纳业务分支逻辑
- `LyricDisplay.vue` 与 `useLyricAutoScroll.ts` 保持“展示/滚动策略”边界
- `LyricFloat.vue` 仅保留窗口交互与控制命令发送，不重复播放器业务逻辑

### 验收

```bash
npm run test:run -- tests/composables/useActiveLyricState.test.ts
npm run test:run -- tests/composables/useLyricAutoScroll.test.ts
npm run test:run -- tests/components/LyricDisplay.test.ts
npm run test:run -- tests/components/LyricFloat.test.ts
```

## Phase 4: Electron IPC 与主进程对齐

### 工作项

- 固化歌词 IPC 通道契约（payload 字段、可空值、触发时机）
- 校验 `DesktopLyricManager` 的缓存回放与 ready 顺序逻辑
- 确保 `player:get-lyric` 与缓存歌词返回行为一致且可预测

### 验收

```bash
npm run test:run -- tests/electron/DesktopLyricManager.test.ts
npm run test:run -- tests/electron/player.handler.test.ts
npm run test:run -- tests/electron/api.handler.test.ts
```

## Phase 5: 清理与发布

### 工作项

- 清理废弃导出与临时兼容代码
- 更新文档（API、测试、架构说明）
- 执行全量回归

### 验收

```bash
npm run test:run
npm run build:web
npm run build:electron
```

## 5. 分支与提交策略

- 建议分支：`refactor/lyric-system`
- 提交粒度：每个 Phase 至少 1 次独立可回滚提交
- 提交信息建议：
- `refactor(lyric): extract lyric sync module from player store`
- `refactor(lyric): unify lyric parser entry and deprecate legacy parser`

## 6. 回滚策略

每个阶段设置回滚点，触发条件如下：

- 核心歌词测试失败且 30 分钟内无法定位
- 桌面歌词出现空白/不更新/锁定异常
- 歌词索引与播放进度明显错位

回滚动作：

- 回退当前阶段提交，不回滚前一阶段稳定提交
- 保留失败用例与日志，形成问题记录后再进入下一轮

## 7. 完成定义（Definition of Done）

满足以下全部条件才算完成：

- 全量测试通过：`npm run test:run`
- 构建通过：`npm run build:web`、`npm run build:electron`
- 不再新增对遗留歌词解析路径的业务依赖
- 歌词 Web 视图、桌面歌词窗口、IPC 同步行为与重构前一致
- 文档已更新，包含迁移说明与模块边界
