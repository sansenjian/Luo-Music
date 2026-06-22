# 本地音乐库架构

本地音乐库是 Electron 桌面端核心能力，不作为第三方在线平台插件实现。它负责扫描用户选择的文件夹、解析本地音频元数据、维护 SQLite 索引、提供分页查询，并把本地歌曲映射成播放器可消费的标准歌曲对象。

Web 端没有文件系统、SQLite native binding 和本地 helper 权限，因此本地音乐库在 Web 端只返回 unsupported 状态。

## 运行边界

```text
Renderer
  src/composables/useLocalLibrary.ts
  src/composables/local-library/*
  src/features/home/LocalMusicView.vue
        |
        | src/platform / preload IPC
        v
Electron main
  electron/ipc/handlers/localLibrary.handler.ts
  electron/local-library/service.ts
  electron/local-library/repository.ts
  electron/local-library/watchCoordinator.ts
        |
        | native helper process
        v
native/local-library-scanner
```

主进程是本地音乐库的唯一可信边界。渲染进程只通过 `src/platform` 和 preload 暴露的 IPC 合同访问能力，不直接读取文件系统或 SQLite。

## 核心模块

| 模块                                            | 职责                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `packages/shared/types/localLibrary.ts`         | 本地音乐库的共享类型、分页查询、健康摘要、元数据候选和去重模型    |
| `packages/shared/protocol/channels.ts`          | `local-library:*` IPC 通道名                                      |
| `packages/shared/contracts/ipc.ts`              | preload / renderer / main 共享 IPC 类型合同                       |
| `electron/ipc/handlers/localLibrary.handler.ts` | IPC 参数校验、桌面 dialog、事件广播                               |
| `electron/local-library/service.ts`             | 文件夹生命周期、扫描协调、watcher 管理、状态广播、封面清理        |
| `electron/local-library/repository.ts`          | SQLite schema、事务写入、分页查询、健康摘要、元数据候选和去重索引 |
| `electron/local-library/repository.kysely.ts`   | Kysely typed SQL 编译，生成列表、艺术家、专辑分页查询             |
| `electron/local-library/duplicates.ts`          | strict / fuzzy 重复歌曲识别与代表曲目排序                         |
| `electron/local-library/networkMetadata.ts`     | 在线元数据候选评分和建议生成                                      |
| `native/local-library-scanner`                  | Rust 文件枚举 helper，输出可扫描文件清单                          |

## 数据模型

SQLite 由 `LocalLibraryRepository` 初始化和迁移。当前主表包括：

| 表                                  | 说明                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `local_library_folders`             | 用户添加的文件夹、启用状态和最近扫描时间                  |
| `local_library_tracks`              | 本地歌曲索引、文件路径、展示元数据、技术元数据和封面 hash |
| `local_library_metadata_candidates` | 可人工确认的元数据修复候选                                |
| `local_library_scan_jobs`           | 最近扫描任务状态和统计                                    |
| `local_library_duplicate_groups`    | 重复歌曲分组，按 `mode` 区分 strict / fuzzy               |
| `local_library_duplicate_members`   | 重复歌曲成员、rank、隐藏状态和质量分                      |

查询执行仍走 `better-sqlite3` 同步连接。Kysely 只负责 typed SQL compile，这样可以先减少手写动态 SQL 风险，而不把扫描链路整体改成异步数据库访问。

## 扫描流程

1. 渲染进程调用 `local-library:add-folder` 或 `local-library:scan`。
2. `LocalLibraryService` 创建 scan job，并让 `native/local-library-scanner` 枚举音频文件。
3. 主进程读取文件状态和音频元数据，生成 `LocalLibraryTrack`。
4. `LocalLibraryRepository.upsertTracks()` 批量写入 tracks，并维护元数据候选。
5. 扫描结束后重建 strict / fuzzy 重复索引。
6. service 广播 `local-library:updated` 和 `local-library:scan-status`。
7. 渲染进程按 cursor 分页刷新歌曲、艺术家或专辑视图。

扫描和 watcher 更新都必须走 service。不要从 renderer 或其他 Electron 模块直接写 repository。

## 分页与查询

列表查询使用 `LocalLibraryTrackQuery`：

```ts
type LocalLibraryTrackQuery = {
  cursor?: string | null
  limit?: number
  search?: string
  folderId?: string | null
  artist?: string | null
  album?: string | null
  hideDuplicates?: boolean
  showDuplicatesOnly?: boolean
  duplicateMode?: 'strict' | 'fuzzy'
  recentlyAddedOnly?: boolean
  recentlyAddedSince?: number
}
```

默认页大小来自 `LOCAL_LIBRARY_DEFAULT_PAGE_SIZE`。新查询条件应先进入共享类型和 IPC 参数校验，再进入 Kysely 查询构建器，最后由 repository 执行。

## 重复歌曲识别

本地音乐库维护两套重复索引：

| 模式     | 适用场景       | 规则                                                                           |
| -------- | -------------- | ------------------------------------------------------------------------------ |
| `strict` | 默认隐藏重复项 | 标题和艺术家归一化后完全一致，时长差不超过 2 秒，版本标记兼容                  |
| `fuzzy`  | 查找疑似重复   | 标题相似度不低于 0.82，艺术家相似度不低于 0.9，时长差不超过 8 秒，版本标记兼容 |

代表曲目按质量分排序。质量分综合 codec、bit depth、sample rate、bitrate、封面和基础元数据完整度。无损格式优先于有损格式；同分时更接近组内中位时长、更大文件和稳定路径排序会参与决策。

`hideDuplicates` 默认依赖 strict 索引。需要展示疑似重复时，查询传入 `duplicateMode: 'fuzzy'`。

## 元数据候选

元数据来源使用 `LocalLibraryMetadataFieldSource`：

| 来源       | 说明             |
| ---------- | ---------------- |
| `embedded` | 音频文件内嵌标签 |
| `filename` | 从文件名推断     |
| `folder`   | 从目录结构推断   |
| `network`  | 在线元数据候选   |
| `unknown`  | 无可靠来源       |

`electron/local-library/networkMetadata.ts` 只做评分和建议生成，不直接请求网易云、QQ 音乐或第三方 API。在线平台数据应由插件或调用方提供为 `LocalLibraryNetworkMetadataCandidateInput`，再由本模块计算置信度和建议字段。

评分权重：

| 字段     | 权重 |
| -------- | ---- |
| title    | 45%  |
| artist   | 30%  |
| album    | 15%  |
| duration | 10%  |

只有本地字段来源较弱时，才会生成替换建议。例如来源是 `filename`、`folder` 或 `unknown` 时可以建议 title / artist / album；来源是 `embedded` 时不自动建议覆盖。

## 封面与播放联动

本地音乐库只在数据库里保存 `coverHash`。封面文件由主进程管理，渲染进程通过 `local-library:get-cover` 按 `thumb`、`album` 或 `large` 尺寸读取。

播放器识别本地歌曲时使用 `LOCAL_LIBRARY_SONG_ID_PREFIX = 'local:'` 或 `song.extra.localSource === true`。本地歌曲进入 native audio 输出时，播放器仍通过统一播放状态和音频输出服务协调，避免 Chromium 与 Rust helper 同时播放同一首歌。

## 验证入口

| 改动范围                                          | 推荐命令                              |
| ------------------------------------------------- | ------------------------------------- |
| 纯类型、mapper、query helper、IPC 参数校验        | `npm run test:run`                    |
| 打开真实 SQLite 或实例化 `LocalLibraryRepository` | `npm run test:native`                 |
| Rust scanner 构建检查                             | `npm run check:local-library-scanner` |
| 文档站变更                                        | `npm run docs:build`                  |

涉及 `better-sqlite3` 的测试不要绕过 `npm run test:native`。该脚本会处理 Electron / Node native binding 的恢复流程。

## 维护规则

- 新 IPC 能力先改 `packages/shared/contracts/ipc.ts` 和 `packages/shared/types/localLibrary.ts`。
- 参数校验留在 `electron/ipc/handlers/localLibrary.handler.ts`，不要让 repository 接收不可信 payload。
- 新查询条件在 Kysely helper 中生成 SQL，repository 只执行编译后的 SQL。
- 扫描、watcher、删除文件夹和修复元数据后都要重建重复索引。
- 在线元数据只能作为候选，不应静默覆盖用户本地标签。
- 本地音乐库是核心桌面能力，不要把文件系统或 SQLite 权限暴露给第三方插件。
