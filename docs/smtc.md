# SMTC 第一方拓展插件规划

## Summary

在 Electron 桌面端增加基于 navigator.mediaSession 的 Windows SMTC 支持，并作为 `builtin.smtc` 第一方拓展插件在插件管理页显示。开关默认关闭，仅在 Electron 的插件管理页「拓展」分类显示。实现必须解决 3 个关键点：启停时立即同步状态、本地封面异步竞态、独立持久化。

## Key Changes

- 新增独立实验设置 composable，例如 useExperimentalFeatures。
  - 持久化 key 使用单独 JSON 键，例如 experimentalFeatures
  - 结构为 { smtcEnabled: boolean }
  - 默认值为 false
  - 读写使用现有 storageService.getJSON/setJSON
  - 不并入 player 持久化对象，也不依赖单一根 settings 对象
- 在插件管理页「拓展」分类显示 Windows SMTC。
  - 只在 Electron 下显示 `builtin.smtc`
  - 通过第一方插件启用 / 停用按钮切换
  - 切换时立即生效，不要求重启
- 新增 `src/extensions/smtc/useSmtcExtension.ts` 作为 SMTC 第一方拓展启动器：
  - `App.vue` 只调用 `useSmtcExtension()`，不再直接组合 SMTC 开关、窗口归属、MediaSession 和 `playerCore`
  - 启动器负责判断 Electron 环境、读取 `smtcEnabled`、排除桌面歌词预加载窗口，并把底层 `playerCore` 注入给 MediaSession 同步层
  - 窗口归属判断抽成 `isSmtcPrimaryWindow()`，避免散落 `#/desktop-lyric` 判断
- 主进程按 SMTC 开关控制 Chromium 启动参数：
  - `smtcEnabled = true` 时启动参数使用 `enable-features=HardwareMediaKeyHandling,MediaSessionService`
  - `smtcEnabled = false` 时启动参数使用 `disable-features=HardwareMediaKeyHandling,MediaSessionService`
  - 渲染端切换 `builtin.smtc` 时通过 `smtc:set-enabled` 同步状态到主进程 `electron-store`
  - Windows 下如果当前进程启动参数与新开关不一致，主进程会 relaunch 应用，使关闭后不再残留“未知应用 / Luo-Music”的系统媒体面板
- 重构 src/composables/useMediaSession.ts 为“响应式启停”模型：
  - 输入改为 enabled: () => boolean
  - 输入可注入 systemMediaSessionController，用于同步播放器底层 Audio 的系统媒体暴露状态
  - 在启用时先执行完整 cleanup，再重新注册 handlers
  - 启用完成后立即同步：
    - 当前歌曲 metadata
    - 当前 playbackState
    - 当前 positionState
    - 若当前正在播放，则立即启动 position timer
  - 关闭时完整清理：
    - metadata = null
    - playbackState = 'none'
    - setPositionState() 清空旧进度 / 时长状态
    - 所有 action handler 置空
    - 停止 position timer
    - 调用 playerCore.setSystemMediaSessionEnabled(false)，避免 Chromium 在清空 metadata 后继续把 audio 元素以“未知应用 / Luo-Music”形式暴露到 Windows 媒体面板
- PlayerCore 新增 setSystemMediaSessionEnabled(enabled)：
  - 启用时移除 disableremoteplayback / noremoteplayback 限制
  - 停用时设置 disableRemotePlayback、disableremoteplayback 和 controlsList.noremoteplayback
  - 该逻辑只处理系统媒体暴露，不停止当前播放，也不改变播放队列
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
- 新增主进程 SMTC 运行时接口：
  - `configureSmtcCommandLine()`：应用启动早期读取主进程持久化状态并设置 Chromium features
  - `smtc:set-enabled` IPC：同步插件开关到主进程，并在 Windows 下按需 relaunch
- useMediaSession 新签名调整为：
  - enabled: () => boolean
  - systemMediaSessionController?: { setSystemMediaSessionEnabled(enabled: boolean): void }
  - 其余播放器依赖保持注入式，便于测试
- useSmtcExtension 作为对 App 暴露的唯一 SMTC 启动入口：
  - 内部调用 useMediaSession
  - 内部处理主窗口 / 桌面歌词窗口归属
  - 内部绑定 `builtin.smtc` 对应的实验开关
- CoverCacheManager 保持“按 key 独立缓存 + URL 规范化”职责，不扩展为全局封面索引。

## Test Plan

- 实验设置测试：
  - 默认 smtcEnabled === false
  - 独立 key 持久化恢复正确
  - 不会覆盖其他设置 key
- useMediaSession 测试：
  - 启用时立即同步 metadata、playbackState、positionState
  - 关闭时完整清理 metadata、playbackState、positionState、handlers、timer
  - 关闭后重新开启时能恢复当前播放状态，不等待下一次播放事件
  - 本地歌曲封面通过 localCoverHash 正确解析
  - 本地封面异步返回时，旧请求不会覆盖新歌曲 metadata
  - play/pause/nexttrack/previoustrack/seekto/seekforward/seekbackward 映射正确
  - 启用 / 停用 / 卸载时会同步底层 Audio 的系统媒体暴露状态
- 插件管理测试：
  - Electron 下显示 `builtin.smtc`
  - 非 Electron 下不显示 `builtin.smtc`
  - 切换第一方拓展插件会更新 SMTC 启用状态
- 主进程启动测试：
  - 默认 SMTC 关闭时禁用 Chromium MediaSession / HardwareMediaKeyHandling features
  - 插件开关通过 `useExperimentalFeatures` 同步到主进程
- SMTC 启动器测试：
  - 主窗口启用时注册 MediaSession
  - 桌面歌词 route / hash 窗口不接管 SMTC
  - 非 Electron 环境不注册 MediaSession
  - 插件开关和 route 变化会实时影响 enabled 判断
- 全量回归：
  - npm run test:run 通过

## Assumptions

- storageService 继续按 key 独立读写，不引入根 settings 对象。
- 实验开关只在 Electron 环境显示。
- 远程封面继续直接使用 URL，不转 data URL。
- positionState 更新策略保持当前简单模型：启用时立即同步，播放中按固定间隔同步。
