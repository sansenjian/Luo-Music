# Review Findings 修复规划

## 背景

`docs/reports/review-findings-verification-2026-03-28.md` 当前确认仍有 21 个问题未修复，分布在：

- API / Vercel 路由
- 歌词状态聚合与 IPC 同步
- 播放器状态持久化
- 用户中心视图与事件组件
- 测试与文档示例

这些问题里，优先级最高的是“会导致真实行为错误或状态污染”的逻辑问题；文档措辞、示例失效和测试债务应放在主链路稳定后集中清理。

## 当前进展

### 2026-03-28 已完成

- P0 项已完成代码修复
- P0 对应回归测试已补齐并通过
- P1 项已完成代码修复
- P1 对应回归测试与 typecheck 已通过
- P2 项已完成代码修复
- P2 对应定向测试、lint 与 typecheck 已通过

本轮已完成的 P0 修复包括：

1. `api/[...netease].ts`
   runtime 初始化失败后不再永久缓存失败 Promise，后续请求可重试
2. `api/[...netease].ts`
   普通异常不再被误判为模块响应并错误映射成 404
3. `src/composables/useActiveLyricState.ts`
   空字符串歌词保留，不再被 `emptyText` 覆盖
4. `src/composables/useIpcActiveLyricState.ts`
   `refreshDisplayFromCachedLyrics()` 改为按 `ipcProgress` 重算索引
5. `src/composables/useIpcActiveLyricState.ts`
   `onSongChange` 显式重置 `ipcLyricIndex.value = -1`
6. `src/composables/useIpcActiveLyricState.ts`
   `lastAcceptedSequence` 改为在 hydration 版本校验通过后再写入
7. `src/store/player/playbackActions.ts`
   播放前补齐的歌曲详情会回写到 `sourceSong`
8. `src/store/playerStore.ts`
   `toggleLyricType()` 在异常持久化状态下会自动补回 `original`
9. `src/views/UserCenter.vue`
   移除外层 loading gate，tab 在 loading 期间保持挂载

### 已验证

执行并通过：

```bash
npm run test:run -- tests/api/neteaseVercelFunction.test.ts tests/composables/useActiveLyricState.test.ts tests/components/LyricFloat.test.ts tests/store/player/playbackActions.test.ts tests/store/playerStore.test.ts tests/views/UserCenter.test.ts
```

### 当前剩余重点

- 暂无未关闭的规划项；如需继续推进，应回到 `docs/reports/review-findings-verification-2026-03-28.md` 或重新做一轮 review

## 目标

- 先修真实运行时缺陷，避免错误缓存、旧快照污染、歌词索引错乱和状态持久化异常
- 再收敛视图层与测试层债务，降低后续回归成本
- 最后整理文档和示例，确保仓库说明与代码状态一致

## 修复原则

- 行为正确优先于结构美化
- 高风险模块先补回归测试，再改实现
- 修改范围收敛在对应边界，不借机做无关重构
- 文档问题集中处理，但不阻塞运行时缺陷修复

## 问题分级

### P0：真实行为错误，优先修复

状态：已完成

1. `api/[...netease].ts`
   `runtimePromise` reject 后被永久缓存，后续请求无法自恢复
2. `api/[...netease].ts`
   异常分支把普通错误误判为模块响应，可能错误映射成 404
3. `src/composables/useActiveLyricState.ts`
   `currentLyric` 使用 `||`，空字符串歌词会被误判为缺失
4. `src/composables/useIpcActiveLyricState.ts`
   `refreshDisplayFromCachedLyrics()` 未按 `ipcProgress` 重算索引
5. `src/composables/useIpcActiveLyricState.ts`
   `onSongChange` 未显式重置 `ipcLyricIndex.value`
6. `src/composables/useIpcActiveLyricState.ts`
   hydration 版本校验前提前写入 `lastAcceptedSequence`
7. `src/store/player/playbackActions.ts`
   `sourceSong` 未完整回写详情字段，导致播放期详情与持久状态分裂
8. `src/store/playerStore.ts`
   `toggleLyricType()` 对无 `original` 的持久化状态缺乏兜底
9. `src/views/UserCenter.vue`
   外层 loading gate 会卸载已挂载 tab 组件

### P1：高风险结构问题，影响后续维护和同步稳定性

状态：已完成

1. `api/qq/[...qq].ts`
   `normalizeQQRequestUrl()` 对包含多个 `?` 的 URL 解析不稳
2. `src/store/player/lyricSync.ts`
   仍然承担 store 状态写入与桌面歌词 sequence 管理，helper 边界不纯
3. `src/components/user/EventsView.vue`
   仍在视图层执行 `JSON.parse(event.json)`
4. `src/components/user/EventsView.vue`
   仍为非 TS `script setup` + 运行时 props 声明
5. `src/constants/lyric.ts`
   `LYRIC_UI_UPDATE_INTERVAL` 与 `DEFAULT_LYRIC_UPDATE_INTERVAL` 重复字面量

### P2：测试与文档债务，可在主链路稳定后处理

状态：已完成

1. `docs/guide/e2e-testing.md`
   `route.intercept()` 文案与实际示例不一致
2. `docs/plans/desktop-lyric-optimization.md`
   语句表意残缺
3. `docs/plans/lyric-system-refactor-process.md`
   个别表述可读性一般
4. `tests/e2e/search.spec.ts`
   仍使用固定等待 `page.waitForTimeout(1000)`
5. `tests/utils/player/core/playerCore.test.ts`
   大量 `(player as any)` 未清理
6. `docs/reference/examples/injector-example.ts`
   引用未定义 token 与不存在的相对模块路径
7. `docs/reference/examples/injector-example.ts`
   顶层存在实例化副作用

## 分阶段执行计划

## Phase 0：建立修复基线

### 工作项

- 逐项把 21 个问题映射到修复任务单，避免重复修改同一模块
- 为 P0 项确认现有测试覆盖是否足够
- 对缺少保护的行为先补最小回归测试或最小复现用例

### 输出

- 问题与文件映射表
- P0 问题的测试缺口清单
- 修复顺序确认

### 验收

- 所有 P0 问题都有明确归属文件
- 至少为 API、歌词同步、播放器状态三类主链路确认验证方式

## Phase 1：修 API 与请求层错误恢复

状态：已完成

### 覆盖问题

- `api/[...netease].ts` 2 项
- `api/qq/[...qq].ts` 1 项

### 工作项

- 调整 `ensureRuntime()` 的失败缓存策略：
- 仅缓存成功初始化结果，或在失败后清空 `runtimePromise`
- 保证后续请求可以重试加载 runtime
- 收紧 `catch` 分支错误识别：
- 只把符合模块响应结构的异常视为 `NcmModuleResponse`
- 普通异常走通用 500/透传错误处理
- 修正 QQ URL 归一化逻辑：
- 不再依赖裸 `split('?')`
- 保留原始 pathname 与 search，兼容带额外 `?` 的参数值

### 验收

- runtime 初始化失败后再次请求可重试
- 非模块异常不再被错误映射成 404
- QQ 路由对复杂查询串仍能稳定转发

### 建议测试

```bash
npm run test:run -- tests/api
```

如无现成测试目录，至少补：

- `api/[...netease].ts` runtime 重试用例
- `api/[...netease].ts` 非模块异常映射用例
- `api/qq/[...qq].ts` 复杂 query 归一化用例

## Phase 2：修歌词聚合、IPC 时序与播放器状态一致性

状态：已完成

### 覆盖问题

- `src/composables/useActiveLyricState.ts` 1 项
- `src/composables/useIpcActiveLyricState.ts` 3 项
- `src/store/player/playbackActions.ts` 1 项
- `src/store/playerStore.ts` 1 项
- `src/store/player/lyricSync.ts` 1 项
- `src/constants/lyric.ts` 1 项

### 工作项

- 修正歌词空字符串判定：
- 将 `||` 改为 nullish 语义，保留合法空字符串
- 重构 `useIpcActiveLyricState.ts` 的 hydration 与缓存刷新顺序：
- `refreshDisplayFromCachedLyrics()` 统一按 `ipcProgress` 重新解析索引
- `onSongChange` 显式重置 `ipcLyricIndex.value = -1`
- `lastAcceptedSequence` 仅在版本校验通过后更新
- 修复播放详情回写策略：
- `hydrateSongForPlayback()` 产出的详情字段完整回写 `sourceSong`
- 避免运行时歌曲详情与状态持久层不一致
- 给 `toggleLyricType()` 增加兜底：
- 删除 `original` 或持久化缺失时自动恢复最小合法集合
- 收敛 `lyricSync.ts` 边界：
- 把“sequence 管理”和“store.currentLyricIndex 写入”职责拆清
- 若暂不做彻底拆分，至少明确 helper 输入输出并减少隐式副作用
- 合并歌词更新时间常量来源，消除重复字面量

### 依赖关系

- 先改 `useIpcActiveLyricState.ts` 与 `useActiveLyricState.ts`
- 再处理 `playbackActions.ts` / `playerStore.ts`
- 最后整理 `lyricSync.ts` 与常量收敛，避免中途再次改签名

### 验收

- 桌面歌词 hydration 不接受旧快照污染
- 切歌后索引状态立即归零，不沿用上一首歌索引
- seek / hydration / push 后展示歌词与当前进度一致
- 播放期歌曲详情字段和 store 中持久对象保持一致
- `toggleLyricType()` 在异常持久化状态下仍能恢复到合法值

### 建议测试

```bash
npm run test:run -- tests/composables/useActiveLyricState.test.ts
npm run test:run -- tests/composables/useIpcActiveLyricState.test.ts
npm run test:run -- tests/store/player/playbackActions.test.ts
npm run test:run -- tests/store/playerStore.test.ts
```

如涉及桌面歌词同步链路，再补：

```bash
npm run test:run -- tests/components/LyricFloat.test.ts
npm run test:run -- tests/electron/DesktopLyricManager.test.ts
```

## Phase 3：修用户中心视图卸载与事件组件边界

状态：已完成

### 覆盖问题

- `src/views/UserCenter.vue` 1 项
- `src/components/user/EventsView.vue` 2 项

### 工作项

- 调整 `UserCenter.vue` loading 策略：
- 避免统一外层 `v-if` 卸载 tab 内容
- 改为 tab 内局部 loading、骨架屏或占位态
- 把事件 JSON 解析从 `EventsView.vue` 视图层下沉：
- 优先复用 composable 或 adapter
- 组件只消费已解析的展示数据
- 将 `EventsView.vue` 迁移到 TypeScript：
- 使用 `defineProps<...>()`
- 收紧事件数据类型与渲染分支

### 验收

- 切 tab / loading 变化不再销毁已挂载内容
- 事件列表组件不再直接 `JSON.parse`
- `EventsView.vue` 使用 TS props，类型边界明确

### 建议测试

```bash
npm run test:run -- tests/views
npm run test:run -- tests/components/user
```

如果没有对应目录，至少补：

- UserCenter tab 切换与 loading 保活用例
- EventsView 输入已解析事件数据的渲染用例

## Phase 4：补测试债务，降低回归风险

### 覆盖问题

- `tests/e2e/search.spec.ts` 1 项
- `tests/utils/player/core/playerCore.test.ts` 1 项

### 工作项

- 移除 `page.waitForTimeout(1000)`：
- 改为等待可观测条件，如请求完成、元素状态、文本出现
- 收紧 `playerCore.test.ts` 测试替身类型：
- 减少 `(player as any).audio` / `(player as any).audioContext`
- 必要时引入明确的测试 helper 类型

### 验收

- E2E 搜索测试不依赖固定时间等待
- 播放器核心测试中的 `any` 显著减少，至少不再在主要路径散布

### 建议测试

```bash
npm run test:run -- tests/e2e/search.spec.ts
npm run test:run -- tests/utils/player/core/playerCore.test.ts
```

## Phase 5：清理文档与 DI 示例

### 覆盖问题

- `docs/guide/e2e-testing.md` 1 项
- `docs/plans/desktop-lyric-optimization.md` 1 项
- `docs/plans/lyric-system-refactor-process.md` 1 项
- `docs/reference/examples/injector-example.ts` 2 项

### 工作项

- 统一 `docs/guide/e2e-testing.md` 中 API 说明与示例代码
- 修正文档中表意残缺或可读性差的语句
- 处理 `docs/reference/examples/injector-example.ts`：
- 明确该文件是“概念示例”还是“可执行示例”
- 若保留为可执行示例，修正导入路径和 token 来源
- 若仅作展示，移除顶层副作用并显式标注不可直接运行

### 验收

- 文档示例 API 名称前后一致
- 计划文档语义清晰，无明显残句
- `docs/reference/examples/injector-example.ts` 不再引用未定义标识符，也不再包含顶层副作用

## 推荐实施顺序

1. Phase 0：建立基线并确认测试缺口
2. Phase 1：先修 API 层错误恢复与错误映射
3. Phase 2：修歌词、IPC、播放器状态一致性
4. Phase 3：处理用户中心与事件组件边界
5. Phase 4：补测试债务
6. Phase 5：收尾文档与示例

原因：

- Phase 1 和 Phase 2 直接影响真实请求与播放行为
- Phase 3 影响页面稳定性，但依赖前两阶段的状态边界稳定下来
- Phase 4 和 Phase 5 更适合在主逻辑稳定后集中处理

## 风险与回滚点

### 高风险点

- `useIpcActiveLyricState.ts` 时序调整可能影响桌面歌词首帧与切歌行为
- `playbackActions.ts` 字段回写策略可能影响持久化状态和收藏/历史链路
- `UserCenter.vue` loading 结构调整可能影响 tab 生命周期

### 回滚条件

- 桌面歌词出现明显错句、旧句回刷或切歌后错位
- 歌曲详情字段回写后导致播放列表状态异常
- 用户中心 tab 切换出现重复请求、滚动位置丢失或页面闪烁

### 回滚策略

- 以 Phase 为单位提交，确保每个阶段可独立回退
- 高风险模块单独提交，不与文档修改混在一起

## 完成定义

满足以下条件才视为本轮修复完成：

- 21 个问题全部关闭或转为明确记录的后续技术债
- P0 与 P1 项均有对应代码修复
- 相关测试通过，至少执行：

```bash
npm run test:run
```

如涉及构建、Electron 或路径链路，再执行：

```bash
npm run build:web
npm run build:electron
```

如修改文档结构或文档站内容，再执行：

```bash
npm run docs:build
```
