# Review Comment Verification

更新时间：2026-04-08

本文档基于当前工作区代码逐项核对 review comments，仅判断“问题当前是否存在”，不等同于是否立即修复。

说明：

- 当前工作区不是完全干净状态，已存在未提交改动。
- 结论以本地当前文件内容为准。
- “存在”表示当前代码确实仍保留该问题或风险。
- “不算当前问题”表示 comment 有一定道理，但在当前约束或运行环境下不构成明确 defect。
- “风格/测试改进”表示更偏一致性、可维护性或测试质量，不是明确运行时 bug。

## 确认存在

- `electron/service/musicServices.ts`
  - [x] 已修复：`gracefulKill()` 现在会清理 force-kill 定时器并解绑 `exit` 监听。
  - [x] 已修复：`start()` 在 `waitForReady()` 失败时会回收刚启动的子进程，避免孤儿进程。

- `electron/service/requestClient.ts`
  - [x] 已修复：超时分支现在只通过 `req.destroy(error)` 进入统一错误通道。

- `scripts/dev/netease-api-server.cjs`
  - [x] 已修复：`loadModule()` 只对真实模块解析失败继续 fallback，运行时错误会立即抛出。

- `scripts/dev/qq-api-server.cjs`
  - [x] 已修复：`loadModule()` 只对真实模块解析失败继续 fallback，运行时错误会立即抛出。

- `scripts/runtime/qq-api-server.entry.cjs`
  - [x] 已修复：模块加载已移入 `start()`，导入失败会走统一错误路径。
  - [x] 已修复：`server.listen(...)` 的异步启动错误现在会进入现有 `try/catch`。

- `src/composables/useHomePage.ts`
  - [x] 已修复：现在会以真实 `useHomeShell()` 结果为基底，并只覆盖传入的字段。

- `src/store/playerStore.ts`
  - [x] 已修复：`addToNextFromIpc()` 现在会处理 `existingIndex === currentIndex`。
  - [x] 已修复：`setSongList()` 现在按歌曲身份匹配，会同时考虑 `id` 和 `platform`。

- `src/store/searchStore.ts`
  - [x] 已修复：`createSearchStore()` 现支持可选 `storeId`，可创建隔离实例。

- `scripts/run-with-env.cjs`
  - [x] 已修复：Windows `cmd.exe` 路径现在会把 `%` 转义为 `%%`。

- `src/utils/error/center.ts`
  - [x] 已修复：`reportToMain()` 现在会保护 `services.platform()` 调用并在平台服务不可用时直接返回。

- `tests/components/Player.test.ts`
  - [x] 已修复：`vi.mock` 目标已与真实模块解析路径保持一致。

- `tests/electron/mainIndex.test.ts`
  - [x] 已修复：退出清理测试现已断言 `ipcService.dispose()`。

- `tests/electron/gatewayCache.test.ts`
  - [x] 已修复：已补充 `LOCAL_SERVICE_TIMEOUT` 不重试分支覆盖。

- `tests/composables/useSearch.test.ts`
  - [x] 已修复：现在会 `await` 委托的异步 action，避免未观察的 Promise 拒绝。

- `tests/platform/commonPlatformService.test.ts`
  - [x] 已修复：`afterEach` 现在会恢复相关全局属性 descriptor。

- `tests/utils/test-utils.ts`
  - [x] 已修复：`createQQSong()` 现在会强制返回 `'qq'` 平台。

## 不算当前问题

- `src/services/apiService.ts`
  - `createApiService()` 会在构造时取 `fetch`，实现上不够懒加载。
  - 但项目当前声明 `Node >= 22`，支持运行环境自带 `fetch`，因此这不是当前环境下的明确 defect。

- `src/utils/http/transportShared.ts`
  - `isElectronRenderer()` 实际只是委托 `isElectronRuntime()`，命名确实不准确。
  - 目前更像命名误导，不是已确认的运行时错误。

- `tests/store/toastStore.test.ts`
  - comment 要求显式在文件内 `setActivePinia(createPinia())`。
  - 但共享测试 setup 已在 `tests/setup.ts` 中每个测试前执行该初始化，因此这条不构成当前缺陷。

## 风格与测试改进

- `docs/injector-example.ts`
  - `createSearchFacade()` 用对象 spread 合并 deps，显式传 `undefined` 会覆盖默认值。

- `docs/service-layer.md`
  - 文档前面不建议继续使用 accessor，后面的示例仍展示 `getPlatformAccessor()`，表述不一致。

- `src/composables/useCommandContext.ts`
  - 仍使用相对导入，可按规范切换到 `@/` 别名。

- `src/services/commandService.ts`
  - 类型导入仍使用相对路径，可切换到 `@/services/...`。

- `src/components/UserAvatar.vue`
  - 多个 `src` 内模块导入仍使用相对路径，可切换到 `@/` 别名。

- `src/composables/useHomeShell.ts`
  - `(deps.registerKeyboardShortcuts ?? useKeyboardShortcuts)()` 可读性一般，适合拆成局部变量。

- `src/composables/useKeyboardShortcuts.ts`
  - `handleKeydown()` 内部局部变量 `target` 与外层监听目标重名，属于命名遮蔽。

- `src/store/player/playbackActions.ts`
  - `const musicService = this.deps.musicService` 当前看是冗余局部变量。

- `tests/components/Player.test.ts`
  - 多条 comment 都偏测试质量问题：
    - “correct roles” 的标题与断言不完全匹配。
    - “shows play icon” 只检查任意 `svg`，区分度不足。
    - “can access playerStore” 直接依赖内部实现。

- `tests/components/QQLoginModal.test.ts`
  - 当前是整模块替换 mock，可优化为保留真实模块、仅覆盖所需导出。

- `eslint.config.js`
  - `no-restricted-imports` 的 `patterns` 配置在两个规则块中重复。

- `scripts/patch-cross-zip.cjs`
  - `patchElectronWinstallerSign()` 的日志前缀仍写成 `[patch-cross-zip]`，可读性一般。

- `src/auto-imports.d.ts`
  - 仍全局暴露 `createPlayerStore`、`createSearchStore` 以及若干 `*Deps` 类型。
  - 这更像生成配置约束问题，不是运行时 bug。

## 建议优先级

建议优先修复以下几类：

- 进程与资源泄漏：`musicServices.ts`、`qq-api-server.entry.cjs`
- 错误处理正确性：`requestClient.ts`、两个 `loadModule()`
- 状态一致性：`playerStore.ts`
- 可重复测试与回归覆盖：`mainIndex.test.ts`、`gatewayCache.test.ts`、`useSearch.test.ts`

## 本轮验证

- `npx vitest run tests/electron/requestClient.test.ts tests/electron/musicServices.test.ts tests/components/Player.test.ts tests/electron/mainIndex.test.ts tests/electron/gatewayCache.test.ts tests/composables/useSearch.test.ts tests/composables/useHomePage.test.ts tests/platform/commonPlatformService.test.ts tests/store/playerStore.test.ts tests/store/searchStore.test.ts`
- `npm run typecheck`
