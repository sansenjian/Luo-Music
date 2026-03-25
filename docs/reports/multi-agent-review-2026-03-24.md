# 多代理审核报告 - 2026-03-24

## 审查范围

- `electron/**`
- `forge.config.ts`
- `src/App.vue`
- `src/components/Playlist.vue`
- `src/composables/useActiveLyricState.ts`
- `src/store/player/**`
- `src/store/playerStore.ts`
- `src/store/searchStore.ts`
- `src/services/**`
- `src/utils/http/**`
- `src/utils/storage/appStorage.ts`
- `src/constants/audio.ts`
- `src/platform/music/netease.constants.ts`
- `src/main.ts`
- `tests/electron/**`
- `tests/components/**`
- `tests/store/**`
- `tests/services/**`

## 使用的子代理

- `reviewer`：审查服务层、注册表生命周期和导出契约变化
- `electron-pro`：审查 Electron IPC、preload、配置处理和桌面端运行时行为
- `vue-expert`：审查播放器状态、歌词状态、Vue/Pinia 响应式边界
- `qa-expert`：审查测试覆盖和回归风险

## 发现的问题

### 1. 高风险：服务重新注册与激活并发时，替换后的实例可能跳过 `onActivate()`

**证据**

- `src/services/registry.ts:92`
- `src/services/registry.ts:152`
- `src/services/registry.ts:162`

`registerService()` 可以在前一次 `activateService()` 尚未完成时替换服务实现。旧实例的激活 Promise 完成后，仍会把该 identifier 标记为已激活。这样后续对新实例的激活就可能提前返回，导致新实例自己的 `onActivate()` 根本没有执行。

**影响**

新服务实例虽然已经注册且可被获取，但实际上并没有完成启动生命周期。

**最小修复建议**

为每次激活引入注册版本号或 token，只允许当前版本的激活结果写回状态；或者在替换注册前等待/取消旧激活流程。

**测试缺口**

`tests/services/registry.lifecycle.test.ts` 只覆盖了同一实例的并发激活，没有覆盖“激活未完成时重新注册”的竞态。

### 2. 高风险：异步 `onDeactivate()` 可能在实例已经 `dispose()` 之后才执行

**证据**

- `src/services/registry.ts:73`
- `src/services/registry.ts:98`
- `src/services/registry.ts:100`
- `src/services/registry.ts:227`
- `src/services/registry.ts:229`

覆盖/重置路径会先把 `onDeactivate()` 丢到微任务里，再立刻执行 `dispose()`。这样一来，任何异步停用逻辑都会跑在已经销毁的对象上。

**影响**

资源 flush、事件解绑、关闭顺序等清理逻辑都可能竞争、失效，或者变成静默错误。

**最小修复建议**

在销毁前显式等待 `deactivateService()` / `deactivateRegisteredServices()` 完成；或者把同步 `reset` 明确定义为“只做 dispose，不承诺生命周期停用”。

**测试缺口**

当前生命周期测试只验证了 hook 被调用，没有验证 `onDeactivate()` 是否在 `dispose()` 之前真正完成。

### 3. 高风险：主进程歌词缓存可能对“当前歌曲”返回旧歌词或空歌词

**证据**

- `electron/ipc/handlers/player.handler.ts:163`
- `electron/ipc/handlers/player.handler.ts:166`
- `src/store/player/playbackActions.ts:118`
- `src/store/player/playbackActions.ts:170`
- `src/store/playerStore.ts:307`
- `src/store/playerStore.ts:464`

渲染进程会先更新 `currentSong`，之后才异步拉取歌词。这个中间态会立即同步给主进程。随后 `player:get-lyric` 对当前歌曲会直接走缓存短路返回，即使此时缓存仍为空，或者实际上还是上一首歌的歌词。

**影响**

桌面歌词窗口和第二个 Electron 消费方最容易拿到错误歌词，而且不会自动回源纠正。

**最小修复建议**

只有在缓存歌词已确认属于同一首歌且内容有效时，才允许短路返回；更稳妥的做法是把歌词所属歌曲 ID 一并纳入快照，并补一条回归测试。

**测试缺口**

`tests/electron/player.handler.test.ts` 只覆盖了“当前歌曲缓存正确”和“非当前歌曲回源”，没有覆盖“当前歌曲但缓存为空/仍是旧歌词”的情况。

### 4. 高风险：桌面歌词首次 hydration 会被后续 IPC 推送反向覆盖

**证据**

- `src/composables/useActiveLyricState.ts:94`
- `src/composables/useActiveLyricState.ts:125`
- `src/composables/useActiveLyricState.ts:133`
- `src/composables/useActiveLyricState.ts:141`

组件挂载时会先发起一次异步 hydration，再注册 `lyric-time-update` 监听。如果 push 更新先到，而 hydration 后到，那么后返回的 hydration 结果会把更新后的歌词状态回滚成旧值。

**影响**

用户在桌面歌词首次打开时，可能看到歌词短暂闪回到上一句。

**最小修复建议**

给 hydration 写回加失效保护，例如 request token 或 `hasReceivedPushUpdate` 标记；一旦收到 push 更新，就丢弃仍在途的 hydration 结果。

**测试缺口**

现有组件测试只覆盖了冷启动补齐，没有覆盖“push 先到、hydrate 后到”的竞态。

### 5. 中风险：配置 IPC 只校验 key，不校验 value

**证据**

- `electron/ipc/handlers/config.handler.ts:56`
- `electron/ipc/handlers/config.handler.ts:72`
- `electron/ipc/handlers/config.handler.ts:82`

`CONFIG_SET` 接收 `unknown`，只校验配置项 key 是否存在，随后直接把 value 当成合法 `AppConfig` 内容持久化并广播。

**影响**

渲染进程可以写入错误类型的配置，例如 `theme: 123` 或 `defaultVolume: "loud"`，而这些污染值会持久化并在下次启动后继续传播。

**最小修复建议**

按配置项 key 做 value 校验，不合法时直接 reject。

**测试缺口**

`tests/electron/config.handler.test.ts` 目前只测了未知 key，没有测“合法 key + 非法 value”。

### 6. 中风险：非法 `music-playmode-control` payload 会把 `playMode` 污染成 `NaN`

**证据**

- `src/store/player/ipcHandlers.ts:171`
- `src/store/player/ipcHandlers.ts:178`
- `src/store/playerStore.ts:185`
- `src/store/playerStore.ts:637`

IPC 处理器把任意 payload 直接 `as PlayMode` 传入。`toPlayMode()` 假设输入一定是数字，遇到非有限值时会产生 `NaN`，而这个结果随后被直接写入 store。

**影响**

顺序播放、单曲循环、随机播放等逻辑分支会被破坏，后续行为会偏离预期。

**最小修复建议**

在 IPC 入口处校验 `mode` 是否为 `0-3` 的合法整数，同时让 `toPlayMode()` 对非有限输入回退到默认值。

**测试缺口**

`tests/store/player/ipcHandlers.test.ts` 只覆盖了合法输入。

### 7. 中风险：播放器状态快照发送过于频繁，且 payload 体积过大

**证据**

- `src/store/playerStore.ts:154`
- `src/store/playerStore.ts:180`
- `src/store/playerStore.ts:464`
- `src/store/playerStore.ts:371`
- `src/store/player/audioEvents.ts:151`

`createPlayerStateSnapshot()` 每次都携带完整的 `playlist` 和 `lyrics`。`$subscribe()` 又会在每次 store 变更时发送这个快照。播放过程中 `progress` 会持续更新，于是 Electron 会收到高频的大体积 structured-clone payload，即使系统已经有增量的歌词更新时间通道。

**影响**

这更像是明确的 IPC 性能回归风险，尤其在长歌单或大歌词数组下会更明显。

**最小修复建议**

把 `PLAYER_SYNC_STATE` 收敛为粗粒度字段同步，或者按字段做去重/节流。至少不要在纯进度更新时重复发送整份 `lyrics` 和 `playlist`。

**测试缺口**

当前测试只验证了 payload 可 clone，没有验证发送频率和体积。

## 验证结果

### 本地执行通过的测试批次

```bash
cmd /c npm run test:run -- tests/services/registry.lifecycle.test.ts tests/services/index.test.ts tests/store/playerStore.lifecycle.test.ts tests/store/player/ipcHandlers.test.ts
cmd /c npm run test:run -- tests/electron/performance.test.ts tests/services/playerService.test.ts tests/services/musicAccessor.test.ts tests/services/musicService.test.ts
```

实际结果：

- 第一批 `20/20` 通过
- 第二批 `37/37` 通过

### 子代理补充验证

`electron-pro` 子代理还报告了以下 Electron 定向测试通过：

- `tests/electron/player.handler.test.ts`
- `tests/electron/config.handler.test.ts`
- `tests/electron/performance.test.ts`
- `tests/electron/DesktopLyricManager.test.ts`
- `tests/electron/mainIndex.test.ts`
- `tests/electron/paths.test.ts`

报告结果：`31/31` 通过。

## 备注

- 我没有保留 QA 子代理最早那条 `musicAccessor.test.ts` 编译失败的结论，因为它和当前工作区状态不一致，而且我本地复跑未复现。
- 这轮没有发现新的打包路径阻断问题，`forge.config.ts` 和 `electron/utils/paths.ts` 看起来是稳定的。
- 仍建议补一次真实 Electron 冒烟，重点看桌面歌词首次打开和多窗口歌词联动。
