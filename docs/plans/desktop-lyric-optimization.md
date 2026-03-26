# 桌面歌词优化分析

## 目标

在不改变现有功能边界的前提下，继续提升桌面歌词的：

- 同步稳定性
- 首帧显示速度
- 更新实时性
- 可维护性

## 当前现状

当前桌面歌词链路主要涉及：

- 渲染层：`src/components/LyricFloat.vue`
- IPC 状态聚合：`src/composables/useIpcActiveLyricState.ts`
- Web/桌面共享歌词聚合入口：`src/composables/useActiveLyricState.ts`
- 渲染进程歌词同步：`src/store/player/lyricSync.ts`
- 播放器时间事件：`src/store/player/audioEvents.ts`
- 主进程窗口管理：`electron/DesktopLyricManager.ts`
- 主进程播放器桥接：`electron/ipc/handlers/player.handler.ts`

当前已经具备：

- `lyric-time-update` 主推送链路
- 桌面歌词首次 hydration
- `player:onPlayStateChange` 兜底刷新
- warm window / ready replay
- 桌面歌词显示异常时的若干 fallback

这说明功能已经能工作，但链路偏复杂，仍有继续收敛空间。

## 主要问题

### 1. 数据源过多

桌面歌词当前会同时依赖：

- `lyric-time-update`
- `player:get-state`
- `player:get-lyric`
- `player:onPlayStateChange`
- `player:onSongChange`

问题：

- 多源状态更容易互相覆盖
- 渲染层需要处理更多竞态
- 桌面歌词问题更难定位

### 2. 主推送与兜底通道存在覆盖风险

即使已经加了保护，桌面歌词仍然存在两类更新：

- 主推送：更实时
- fallback：更可靠但通常更慢

如果边界不够清晰，就容易出现：

- 慢一拍
- 回刷旧句
- 首帧空白后再补

### 3. 首帧依赖异步 hydration

桌面歌词窗口首次打开时，仍可能经历：

1. 窗口出现
2. 占位文案显示
3. 异步获取状态
4. 再切到真实歌词

这会带来明显的“首帧不稳”体感。

### 4. 更新频率仍偏保守

目前桌面歌词已经提速，但从结构上看，仍然主要依赖定时间隔和多路兜底，而不是明确区分：

- 行切换事件
- 播放/暂停事件
- 首帧快照

这意味着继续单纯缩短时间间隔，收益会递减。

## 优化方向

## P0：收敛为单一主数据源

建议目标：

- 桌面歌词以“主进程维护的桌面歌词快照”为唯一主数据源
- 渲染层不主动拼装多路状态，只消费快照和增量事件

建议方案：

- 主进程维护一份 `desktopLyricSnapshot`
- 窗口首次 ready 时直接拿完整快照
- 后续只接收增量更新

这样可以减少：

- `getState + getLyric` 的组合拉取
- renderer 侧复杂 fallback
- 多源状态覆盖

建议落点：

- `electron/DesktopLyricManager.ts`
- `electron/ipc/handlers/player.handler.ts`
- `src/composables/useIpcActiveLyricState.ts`

## P1：歌词事件增加版本信息

建议在桌面歌词更新 payload 中增加：

- `songId`
- `platform`
- `sequence`

用途：

- 丢弃旧歌曲事件
- 丢弃乱序事件
- 避免 fallback 覆盖更晚的主推送

这比仅靠时间戳和“最近 push”保护更稳。

建议落点：

- `src/store/player/lyricSync.ts`
- `electron/DesktopLyricManager.ts`
- `src/composables/useIpcActiveLyricState.ts`

## P1：把“首帧快照”和“增量更新”明确拆开

建议把桌面歌词链路定义为两类数据：

### 快照

用于首次打开窗口时直接渲染：

- 当前歌曲
- 当前歌词行
- 次级歌词行
- 当前索引
- 当前时间
- 播放状态

### 增量

用于播放中更新：

- 行切换
- 播放/暂停
- seek
- 切歌

这样可以避免：

- 首帧占位文案停留过久
- 增量事件承担初始化职责

## P2：进一步细化播放器广播策略

当前播放器广播可以继续拆分为：

- 行变化时立即推送
- 播放状态变化立即推送
- seek 立即推送
- 常规时间推进不重复广播整段歌词文本

这样比继续单纯减小广播间隔更高效。

建议落点：

- `src/store/player/audioEvents.ts`
- `src/store/player/lyricSync.ts`
- `src/store/playerStore.ts`

## P3：增加诊断开关

建议增加开发态日志开关，记录：

- `songId`
- `platform`
- `currentTime`
- `currentLyricIndex`
- `source(push|snapshot|fallback)`

这样以后桌面歌词异常时，可以快速判断：

- 是主进程没推送
- 是窗口没收到
- 是 renderer 回刷了旧状态

建议落点：

- `electron/DesktopLyricManager.ts`
- `src/composables/useIpcActiveLyricState.ts`

## 推荐实施顺序

### Phase A：主数据源收敛

- 主进程维护桌面歌词快照
- 桌面歌词首次打开直接拿快照
- 减少 renderer 侧主动 `getState + getLyric`

### Phase B：事件版本化

- 给桌面歌词 payload 增加 `songId + sequence`
- renderer 丢弃旧事件和乱序事件

### Phase C：播放器广播进一步拆层

- 区分初始化快照、行切换、播放状态、seek
- 减少无意义重复广播

### Phase D：诊断能力补齐

- 增加开发态日志
- 补真实链路回归

## 建议补充测试

应补以下场景：

- 桌面歌词窗口首次打开时，主进程已有当前歌词快照
- 先收到旧状态，再收到新歌词 push，旧状态不得覆盖新句
- 切歌时旧歌曲事件不得污染新歌曲歌词
- seek 后桌面歌词立即跳转到对应行
- 窗口隐藏后恢复显示，首帧直接显示当前句
- 没有 `lyric-time-update` 时，快照/兜底链路仍能恢复

## 结论

当前桌面歌词已经可用，但仍然是“多路兜底后稳定”的结构，不是“天然简单稳定”的结构。

后续最值得做的不是继续小修补，而是：

1. 收敛成单一主数据源
2. 事件版本化
3. 把首帧快照与增量更新拆开

这样桌面歌词的同步问题、慢一拍问题和首帧问题，都会更容易一起解决。
