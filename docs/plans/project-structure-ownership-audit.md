# 项目结构归属审计

本记录服务于 `project-structure-optimization-plan.md` 的 P0-A 阶段：先标记 `src/composables/` 与 `src/utils/` 的后续归属，不在本阶段移动源码。

## Composables 归属

| 归属                            | 文件                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/home`                 | 已迁入 `src/features/home/`：原 `src/components/home/` 中除 `HomeEmptyState.vue` 外的 Home 页专属组件、原 `src/composables/home/*`、`useHomeBrandPlacement.ts`、`useHomePage.ts`、`useHomeShell.ts`、`useHomeSidebarCollections.ts`、`useHomeWorkspaceState.ts`                                                                                                                                               |
| `features/local-library`        | `local-library/*`、`useLocalLibrary.ts`                                                                                                                                                                                                                                                                                                                                                                       |
| `features/user-center`          | 已迁入 `src/features/user-center/`：`useUserCenterPage.ts`、原 `src/composables/user-center/*`、`UserProfileHeader.vue`、`LikedSongsView.vue`、`PlaylistsView.vue`、`EventsView.vue`、`PlaylistDetailPanel.vue`；`AlbumDetailPanel.vue`、`FavoriteAlbumsView.vue`、`SongDetailList.vue` 因 Home 复用已迁到 `src/components/media/`                                                                            |
| `features/player`               | `useActiveLyricState.ts`、`useCoverSwipe.ts`、`useDesktopLyricSettings.ts`、`useDockedPlayerBarLayout.ts`、`useIpcActiveLyricState.ts`、`useLyricAutoScroll.ts`、`useLyricVirtualScroll.ts`、`useMediaSession.ts`、`usePlayerViewModel.ts`                                                                                                                                                                    |
| `features/plugins`              | `usePluginManager.ts`                                                                                                                                                                                                                                                                                                                                                                                         |
| `features/search`               | `useSearch.ts`                                                                                                                                                                                                                                                                                                                                                                                                |
| 跨功能保留在 `src/composables/` | `useAnimations.ts`、`useAppSettings.ts`、`useCommandContext.ts`、`useDeferredMount.ts`、`useKeyboardShortcuts.ts`、`useLikedSongs.ts`、`useFavoriteAlbums.ts`、`useUserEvents.ts`、`useUserPlaylists.ts`、`useNeteaseLoginProfile.ts`、`useProjectUi.ts`、`useRenderStyle.ts`、`useSlider.ts`、`useThemeResourcePacks.ts`、`useThrottledStyleUpdate.ts`、`useWindowChromeState.ts`、`useWindowResizeFrame.ts` |
| 待复核                          | `useExperimentalFeatures.ts`                                                                                                                                                                                                                                                                                                                                                                                  |

## Utils 归属

| 归属                                         | 文件                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 可评估下沉到 `src/base/common`               | `common/image-pool.ts`、`performance/utils.ts`、`runtime.ts`                                                                                                                                     |
| 渲染侧请求层保留在 `src/utils/http`          | `http/*`                                                                                                                                                                                         |
| 错误处理保留在 `src/utils/error`             | `error/*`                                                                                                                                                                                        |
| 播放器功能后续随 `features/player` 评估      | `player/*`、`localPlaylistCoverImage.ts`                                                                                                                                                         |
| 本地音乐后续随 `features/local-library` 评估 | `localLibrary/formatters.ts`                                                                                                                                                                     |
| 渲染侧监控保留在 `src/utils/monitoring`      | `monitoring/*`                                                                                                                                                                                   |
| 跨功能保留在 `src/utils`                     | `cache/coverCache.ts`、`logger.ts`、`performance/index.ts`、`performance/monitor.ts`、`platform.ts`、`songFormatter.ts`、`songIdentity.ts`、`storage/appStorage.ts`、`window/framelessResize.ts` |

## 后续规则

- 迁移 feature 前先确认 AutoImport / Components 扫描策略，或改为显式 import。
- `src/features/home/index.ts` 是 Home feature 的 public API；route 层和跨功能设置入口优先从该入口导入。
- `src/features/user-center/index.ts` 是 UserCenter feature 的 public API；route 层优先从该入口导入页面编排 composable。
- `src/components/home/HomeEmptyState.vue` 暂留在通用组件层，因为歌词和播放列表组件仍复用它；后续可单独改名为跨功能 EmptyState。
- `src/components/media/{AlbumDetailPanel,FavoriteAlbumsView,SongDetailList}.vue` 是 Home 与 UserCenter 共用的媒体展示组件，不归属某个 feature 私有目录。
- 下沉到 `src/base/common` 的工具必须保持平台无关，不能依赖 Vue、DOM、Electron 或 Node-only API。
- `packages/shared` 只承载跨运行时协议、常量和纯类型，不承载 renderer 业务工具。

## Shared 迁移状态

| 状态   | 路径                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| 已迁移 | `src/platform/contracts/protocol/cache.ts` -> `packages/shared/protocol/cache.ts`                 |
| 已迁移 | `src/platform/contracts/protocol/channels.ts` -> `packages/shared/protocol/channels.ts`           |
| 已迁移 | `src/platform/contracts/audio.ts` -> `packages/shared/contracts/audio.ts`                         |
| 已迁移 | `src/platform/contracts/config.ts` -> `packages/shared/contracts/config.ts`                       |
| 已迁移 | `src/platform/contracts/log.ts` -> `packages/shared/contracts/log.ts`                             |
| 已迁移 | `src/platform/contracts/netease.ts` -> `packages/shared/contracts/netease.ts`                     |
| 已迁移 | `src/types/schemas.ts` -> `packages/shared/types/schemas.ts`                                      |
| 已迁移 | `src/types/localLibrary.ts` -> `packages/shared/types/localLibrary.ts`                            |
| 已迁移 | `src/types/player.ts` -> `packages/shared/types/player.ts`                                        |
| 已迁移 | `src/utils/player/constants/playMode.ts` -> `packages/shared/player/playMode.ts`                  |
| 已迁移 | `src/utils/player/core/lyric.ts` -> `packages/shared/player/lyric.ts`                             |
| 已迁移 | `src/platform/music/descriptors.ts` 中的纯 descriptor 类型 -> `packages/shared/types/platform.ts` |
| 已迁移 | `src/platform/contracts/ipc.ts` -> `packages/shared/contracts/ipc.ts`                             |
| 已迁移 | `src/platform/contracts/sandbox.ts` -> `packages/shared/contracts/sandbox.ts`                     |

已迁移旧路径的清理状态：

- `src/types/{schemas,localLibrary,player}.ts` 已删除，调用方改用 `@shared/types/*`。
- `src/utils/player/constants/playMode.ts` 和 `src/utils/player/core/lyric.ts` 已删除，调用方改用 `@shared/player/*`。
- `src/platform/contracts/*` 已删除，调用方改用 `@shared/contracts/*` 或 `@shared/protocol/*`。

当前 Electron 侧已清零 `@/platform/contracts/*`、`@/types/*`、`@/utils/player/core/lyric` 与 `@/platform/music/descriptors` 的共享类型引用。

本轮验证已通过：`npm run check:architecture`、`npm run typecheck`、目标 Electron / player 测试、`npm run lint`、`npm run docs:build`、`npm run build:electron:bundle`、`npm run build:web`、`git diff --check`。
