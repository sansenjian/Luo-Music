# Review Findings Verification

日期：2026-03-28

## 结论概览

### 仍然存在的问题

1. `api/[...netease].ts`
   `ensureRuntime()` 仍然把失败的 `runtimePromise` 永久缓存；`loadRuntime()` 一旦 reject，后续请求不会重试。
2. `api/[...netease].ts`
   `catch` 分支仍然用过宽的 `isRecord(error)` 把普通异常当成 `NcmModuleResponse`，非模块异常会被错误映射成 404。
3. `api/qq/[...qq].ts`
   `normalizeQQRequestUrl()` 仍然使用 `requestUrl.split('?')`，对包含多个 `?` 的 URL 解析不稳。
4. `docs/e2e-testing.md`
   文档仍然写着不存在的 `route.intercept()`，示例实际使用的是 `page.route()`。
5. `docs/plans/desktop-lyric-optimization.md`
   “补真实链路回归”这句表意仍然偏残缺。
6. `docs/plans/lyric-system-refactor-process.md`
   “不承载业务分支蔓延”这句仍然存在，可读性一般。
7. `src/composables/useActiveLyricState.ts`
   `currentLyric` 仍然用 `||`，空字符串歌词会被误判为缺失。
8. `src/composables/useIpcActiveLyricState.ts`
   `refreshDisplayFromCachedLyrics()` 仍然复用 `ipcLyricIndex.value`，没有重新按 `ipcProgress` 解析索引。
9. `src/composables/useIpcActiveLyricState.ts`
   `onSongChange` 里没有显式把 `ipcLyricIndex.value` 重置为 `-1`。
10. `src/composables/useIpcActiveLyricState.ts`
    `lastAcceptedSequence` 仍然在 hydration 版本校验前赋值；如果 snapshot 过期，sequence 状态仍可能被旧快照污染。
11. `src/store/player/lyricSync.ts`
    这个模块仍然同时管理桌面歌词 sequence、修改 `store.currentLyricIndex`，不是纯 helper。
12. `src/store/player/playbackActions.ts`
    `syncPlaybackRuntimeFields()` 仍然只回写 `url/mediaId`，`hydrateSongForPlayback()` 得到的歌曲详情字段不会持久回写到 `sourceSong`。
13. `src/store/playerStore.ts`
    `toggleLyricType()` 仍然假设 `original` 已经在 `this.lyricType` 里；如果持久化状态只有 `trans` / `roma`，会出现异常状态。
14. `src/views/UserCenter.vue`
    仍然有外层 `v-if="activeTabLoading"` loading gate，会让已挂载 tab 组件被整体卸载。
15. `src/components/user/EventsView.vue`
    组件仍然在 `computed` 里 `JSON.parse(event.json)`，解析逻辑没有完全移出视图层。
16. `src/components/user/EventsView.vue`
    仍然是 `<script setup>` 非 TS 写法，`defineProps()` 也还是运行时声明。
17. `src/constants/lyric.ts`
    `LYRIC_UI_UPDATE_INTERVAL` 和 `DEFAULT_LYRIC_UPDATE_INTERVAL` 仍然是重复字面量 `100`。
18. `tests/e2e/search.spec.ts`
    仍然使用 `page.waitForTimeout(1000)`。
19. `tests/utils/player/core/playerCore.test.ts`
    不只是两处，整份测试里还有大量 `(player as any).audio` / `(player as any).audioContext`。
20. `docs/injector-example.ts`
    示例源码仍然引用未定义的 `IApiService` / `ILoggerService`，而且导入路径本身也是 `./registry` / `./decorators` / `./injector` 这类在 `docs/` 目录下并不存在的路径。
21. `docs/injector-example.ts`
    顶层仍然有 `new SimpleService()` / `new DecoratedService()` / `new PlayerService()` 等实例化副作用。

### 不存在或已不适用的问题

1. `electron/sandbox/index.ts`
   当前文件首字节是 `69 6D 70`，也就是 `imp`，没有 UTF-8 BOM。
2. `docs/injector-example.js`
   当前工作区里这个文件已经不存在，`git ls-files docs/injector-example.js` 也没有返回结果，所以“编译产物 JS 不该提交”这条在当前工作区里已不再成立。

### 部分成立，但需要按当前代码理解

1. `src/composables/useIpcActiveLyricState.ts`
   review 里说“另外两个类似 snapshot block 也要改”，但当前代码里只有一个 `getDesktopLyricSnapshot()` 分支和一个 fallback `getState()/getLyric()` 分支，不存在更多同类 block。
2. `src/components/user/EventsView.vue`
   `useUserEvents.ts` 里已经有 `getEventMsg()`，说明解析逻辑曾尝试下沉；但组件仍然重复解析，所以问题仍然存在，只是属于“下沉了一半”。
3. `docs/injector-example`
   当前真正的问题不只是“缺导入”，而是整份示例既有未定义 token，也引用了 `docs/` 目录下并不存在的相对模块路径，说明示例本身没有处在可执行状态。

## 逐项说明

### API / Vercel

- `api/[...netease].ts`
  `ensureRuntime()` 目前是：
  `if (!runtimePromise) runtimePromise = loadRuntime(); return runtimePromise`
  这会把失败 Promise 缓存住。
- `api/[...netease].ts`
  `catch (error)` 中的 `const moduleResponse = isRecord(error) ? (error as NcmModuleResponse) : {}` 仍然过宽。
- `api/qq/[...qq].ts`
  `normalizeQQRequestUrl()` 仍然是 `const [pathname = '/', search = ''] = requestUrl.split('?')`。

### 歌词 / 播放器

- `src/composables/useActiveLyricState.ts`
  `const currentLyric = computed(() => currentLine.value?.text || emptyText)`.
- `src/composables/useIpcActiveLyricState.ts`
  `refreshDisplayFromCachedLyrics()` 仍然只取 line，不会同步修正 `ipcLyricIndex.value`。
- `src/composables/useIpcActiveLyricState.ts`
  hydration 里 `lastAcceptedSequence = snapshot.sequence ?? 0` 发生在 `if (nextHydrationVersion !== hydrationVersion)` 之前。
- `src/store/player/lyricSync.ts`
  仍然有 `desktopLyricSequences`、`nextDesktopLyricSequence()`、`syncLyricIndex()` 内部修改 store。
- `src/store/player/playbackActions.ts`
  `mergeSongDetail()` 会合并 `name/artists/album/duration/mvid/originalId/extra/mediaId`，但 `syncPlaybackRuntimeFields()` 只回写 `url/mediaId`。
- `src/store/playerStore.ts`
  `toggleLyricType()` 删除分支里直接 `filter(item => item !== type)`，没有兜底补回 `original`。

### 视图 / 组件

- `src/views/UserCenter.vue`
  `LikedSongsView` / `PlaylistsView` / `EventsView` 外面仍有统一 `v-if="activeTabLoading"` 包裹。
- `src/components/user/EventsView.vue`
  当前还是运行时 props + 组件内 JSON 解析。

### 文档 / 测试

- `docs/e2e-testing.md`
  文字写的是 `route.intercept()`，代码块却是 `page.route(...)`，前后不一致。
- `docs/plans/desktop-lyric-optimization.md`
  `- 补真实链路回归`
- `docs/plans/lyric-system-refactor-process.md`
  `- 约束 useActiveLyricState 只做状态聚合，不承载业务分支蔓延`
- `tests/e2e/search.spec.ts`
  仍然是固定等待 1000ms。
- `tests/utils/player/core/playerCore.test.ts`
  unsafe `any` 远超 review 评论里点到的两处。

### DI 示例

- `docs/injector-example.ts`
  当前文件首部只导入了：
  - `getService` from `./registry`
  - `inject` from `./decorators`
  - `Injector` / `Inject` / `createInstance` / `createAnnotatedInstance` from `./injector`
- 但同文件内直接使用了：
  - `IApiService`
  - `ILoggerService`
- 且这些标识符在仓库中真实定义位置其实在 `src/services/types.ts`，不是 `docs/` 目录下。
- 同时文件里还有多处顶层实例化：
  - `const _simpleExample = new SimpleService()`
  - `const _decoratedExample = new DecoratedService()`
  - `const _playerExample = new PlayerService()`

## 建议下一步

1. 先修 `api/[...netease].ts`、`api/qq/[...qq].ts`、`useActiveLyricState.ts`、`useIpcActiveLyricState.ts`、`playerStore.ts`、`playbackActions.ts` 这些真实逻辑问题。
2. 再处理 `UserCenter.vue`、`EventsView.vue`、`tests/e2e/search.spec.ts`、`playerCore.test.ts` 的结构和测试问题。
3. 最后收文档与 `docs/injector-example.ts`，因为这部分改动面相对大，适合单独整理。
