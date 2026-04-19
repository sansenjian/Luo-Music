# SMTC 实验功能规划（修正版）

## Summary

在 Electron 桌面端增加基于 navigator.mediaSession 的 Windows SMTC 支持，并作为实验功能提供设置开关。开关默认关
闭，仅在 Electron 设置页显示。实现必须解决 3 个关键点：启停时立即同步状态、本地封面异步竞态、实验设置独立持久
化。

## Key Changes

- 新增独立实验设置 composable，例如 useExperimentalFeatures。
  - 持久化 key 使用单独 JSON 键，例如 experimentalFeatures
  - 结构为 { smtcEnabled: boolean }
  - 默认值为 false
  - 读写使用现有 storageService.getJSON/setJSON
  - 不并入 player 持久化对象，也不依赖单一根 settings 对象
- 在 src/components/SettingsPanel.vue 增加“实验功能”区块。
  - 只在 Electron 下显示
  - 增加 Windows SMTC（实验） 开关
  - 切换时立即生效，不要求重启
- 重构 src/composables/useMediaSession.ts 为“响应式启停”模型：
  - 输入改为 enabled: () => boolean
  - 在启用时先执行完整 cleanup，再重新注册 handlers
  - 启用完成后立即同步：
    - 当前歌曲 metadata
    - 当前 playbackState
    - 当前 positionState
    - 若当前正在播放，则立即启动 position timer
  - 关闭时完整清理：
    - metadata = null
    - playbackState = 'none'
    - 所有 action handler 置空
    - 停止 position timer
- 本地封面解析继续复用现有 src/utils/cache/coverCache.ts 和 PlatformService.getLocalLibraryCover(hash)。
  - CoverCacheManager 继续负责把返回值标准化为 MediaMetadata.artwork 可用 URL
  - 远程封面直接使用 song.album.picUrl
  - 不做全量预加载，只处理当前播放歌曲
- 解决封面异步竞态：
  - 在 useMediaSession 内为 metadata 更新维护请求序列号，例如 metadataRequestId
  - 每次歌曲变化或启用状态变化时递增
  - 本地封面请求返回后，只有当序列号仍为当前值时才允许写入 mediaSession.metadata
  - 该序列同时保护 metadata、artwork 更新，避免“前一首歌的封面覆盖后一首歌”
- 保留现有 action 映射：
  - play -> playerService.play()
  - pause -> playerService.pause()
  - nexttrack -> playerStore.playNext()
  - previoustrack -> playerStore.playPrev()
  - seekto -> playerStore.seek(time)
  - seekforward/seekbackward 保留，默认步长继续使用固定秒数，若事件带 seekOffset 则优先使用
- 不引入 globalShortcut fallback，不增加主进程逻辑；第一版只依赖 Chromium mediaSession。

## Public APIs / Interfaces

- 新增实验设置接口：
  - experimentalFeatures: Ref<{ smtcEnabled: boolean }>
  - smtcEnabled: ComputedRef<boolean>
  - setSMTCEnabled(next: boolean): void
- useMediaSession 新签名调整为：
  - enabled: () => boolean
  - 其余播放器依赖保持注入式，便于测试
- CoverCacheManager 保持“按 key 独立缓存 + URL 规范化”职责，不扩展为全局封面索引。

## Test Plan

- 实验设置测试：
  - 默认 smtcEnabled === false
  - 独立 key 持久化恢复正确
  - 不会覆盖其他设置 key
- useMediaSession 测试：
  - 启用时立即同步 metadata、playbackState、positionState
  - 关闭时完整清理 metadata、handlers、timer
  - 关闭后重新开启时能恢复当前播放状态，不等待下一次播放事件
  - 本地歌曲封面通过 localCoverHash 正确解析
  - 本地封面异步返回时，旧请求不会覆盖新歌曲 metadata
  - play/pause/nexttrack/previoustrack/seekto/seekforward/seekbackward 映射正确
- 设置面板测试：
  - Electron 下显示实验开关
  - 非 Electron 下不显示
  - 切换开关会更新实验设置
- 全量回归：
  - npm run test:run 通过

## Assumptions

- storageService 继续按 key 独立读写，不引入根 settings 对象。
- 实验开关只在 Electron 环境显示。
- 远程封面继续直接使用 URL，不转 data URL。
- positionState 更新策略保持当前简单模型：启用时立即同步，播放中按固定间隔同步。
