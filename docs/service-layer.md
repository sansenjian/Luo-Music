# 服务层与 DI 使用规则

## 当前结论

仓库当前采用的默认路线不是完整 IoC 容器，也不是“所有地方都构造注入”。

当前规则已经明确为：

1. 业务代码默认通过 `services.xxx()` 获取能力。
2. 对测试敏感、状态复杂、外部依赖多的模块，允许增加显式 `deps` 注入入口。
3. `@injectParam(...)` 仅用于基础设施层或明确需要实例化的类，不向普通 Vue 组件、页面和一般 composable 扩散。

这条路线的目标是把服务访问、测试替身和边界收口统一起来，同时避免引入重量级容器复杂度。

## 默认路径

### 1. 业务代码默认使用 `services.xxx()`

适用场景：

- Vue 组件
- composable
- store 内部的普通服务读取
- 业务模块中的平台、日志、错误、配置、API、存储访问

示例：

```ts
import { services } from '@/services'

const platformService = services.platform()
const logger = services.logger().createLogger('home')

if (platformService.isElectron()) {
  logger.info('Running in Electron')
}
```

为什么这是默认路径：

- 代码量最少
- 与现有服务注册/override 机制兼容
- 不会强迫组件或 composable 引入额外实例化模型
- 便于逐步迁移旧代码

### 2. 热点模块使用显式 `deps`

适用场景：

- 复杂 store
- 高副作用 composable
- 测试里经常需要替身依赖的模块

当前已落地示例：

- [`src/store/playerStore.ts`](./../src/store/playerStore.ts)
- [`src/composables/useSearch.ts`](./../src/composables/useSearch.ts)
- [`src/composables/useHomePage.ts`](./../src/composables/useHomePage.ts)
- [`src/api/user.ts`](./../src/api/user.ts)

推荐形式：

```ts
type ExampleDeps = {
  getApiService?: () => Pick<ApiService, 'request'>
}

const defaultDeps: Required<ExampleDeps> = {
  getApiService: () => services.api()
}

export function createExample(deps: ExampleDeps = {}) {
  const resolved = { ...defaultDeps, ...deps }
  const api = resolved.getApiService()
  // ...
}
```

为什么要这样做：

- 测试可以传最小替身，不必 `vi.mock()` 整个模块
- 不需要改变业务使用方的默认调用方式
- 可以保留 `services.xxx()` 作为默认实现

## 限制场景

### 1. 不要在业务层继续引入 accessor 兼容入口

下面这类兼容层不应该再新增：

- `getPlatformAccessor()`
- `getPlayerAccessor()`

原因：

- 会绕开主服务入口
- 容易重新引入隐式 `setupServices()` 和 service locator 扩散
- 让代码评审难以判断依赖边界

### 2. 不要在模块顶层固化服务实例

避免这样写：

```ts
const api = services.api()
const platform = services.platform()
```

除非这是一个明确的单例/模块边界入口，并且你确认不会影响 `resetServices()`、测试 override 或生命周期管理。

推荐：

- 在函数内部读取
- 用 getter 注入
- 用工厂闭包解析

### 3. 不要把 `@injectParam(...)` 扩散到普通 Vue 业务代码

不推荐场景：

- Vue SFC
- 页面级 composable
- 只读一次服务的普通业务类

推荐场景：

- 基础设施类
- 明确需要 `Injector` 控制实例化的类
- 测试里需要验证显式构造依赖关系的类

## `@injectParam(...)` 什么时候能用

`@injectParam(...)` 的前提是：

- 这个类本身值得单独实例化
- 依赖关系必须显式写在构造函数上
- 你真的会通过 `Injector` 或 `createInstance()` 创建它

示例：

```ts
import { injectParam } from '@/services/injector'
import { IApiService, ILoggerService } from '@/services/types'

class DownloadJob {
  constructor(
    @injectParam(IApiService) private api: ApiService,
    @injectParam(ILoggerService) private logger: LoggerService
  ) {}
}
```

反过来说，如果你不会通过 `Injector` 来实例化这个类，就不要为了“看起来更 DI”而添加 `@injectParam(...)`。

## `ApiService` 与 `ConfigService` 的使用边界

### `ApiService`

适用场景：

- 简单 GET/POST 请求代理
- 想统一 Electron/Web 请求入口
- 想降低业务模块对底层 transport 的耦合

当前试点：

- [`src/api/user.ts`](./../src/api/user.ts)

不适用场景：

- 已经有复杂适配器、cookie 注入、定制 transport 拦截链的模块
- 例如 QQ 音乐链路仍以独立 transport/adapter 为主，只在配置解析上接入服务层

### `ConfigService`

适用场景：

- 端口
- 环境模式
- 可抽象为“应用配置”的地址或服务发现入口

当前试点：

- [`src/api/qqmusic.ts`](./../src/api/qqmusic.ts)

不推荐继续散落：

- `QQ_API_SERVER`
- `NETEASE_API_PORT`
- 直接读 `import.meta.env` 后再在业务模块里拼装配置值

## 评审清单

提交涉及服务层或 DI 变更时，至少检查下面几项：

1. 这段代码是不是可以直接用 `services.xxx()`，而不是再引入新的兼容入口？
2. 如果加了 `deps`，是不是只暴露了最小接口？
3. 有没有在模块顶层缓存服务实例？
4. 有没有继续直接访问 `localStorage`、平台 API、原始环境判断，而不是先过服务边界？
5. 如果用了 `@injectParam(...)`，这个类是否真的通过 `Injector` 创建？
6. 这次改动是否让测试更容易替身注入，而不是更依赖模块 mock？

## 测试建议

优先顺序：

1. 先传显式替身依赖
2. 再用 `setupServices({ ...overrides })`
3. 最后才考虑 `vi.mock()` 模块级入口

推荐示例：

```ts
const usePlayerStore = createPlayerStore(
  {
    audioManager: mockAudioManager,
    getPlatformAccessor: () => mockPlatformService
  },
  'player-test'
)
```

## 非目标

下面这些不在当前服务层路线内：

- 不引入 Inversify 一类完整容器
- 不新增 request scope / child container
- 不为了统一而把所有业务模块都改成构造注入
- 不要求所有老模块一次性迁移完毕
