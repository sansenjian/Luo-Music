# 请求层说明

LUO Music 的请求层已经从旧的 `request.js` 方案收敛到 `src/utils/http/`。当前默认网易云请求客户端定义在 `src/utils/http/index.ts`，底层工厂在 `src/utils/http/transportFactory.ts`。

## 设计目标

- 统一浏览器与 Electron 渲染进程的请求入口
- 收敛缓存、取消、重试和 cookie 注入逻辑
- 在登录态失效时统一触发本地会话清理
- 为后续来源和插件扩展保留 `createTransport()` 工厂能力
- 推动外部响应在平台边界转换为框架内部通用格式，避免业务层消费平台原始结构

## 关键模块

| 模块                                 | 作用                                            |
| ------------------------------------ | ----------------------------------------------- |
| `src/utils/http/index.ts`            | 默认请求实例、缓存与取消导出                    |
| `src/utils/http/transportFactory.ts` | 传输层工厂、cookie 注入与 Electron adapter 组装 |
| `src/utils/http/requestCache.ts`     | GET 请求缓存                                    |
| `src/utils/http/requestCanceler.ts`  | 取消与去重                                      |
| `src/utils/http/requestRetry.ts`     | 重试策略                                        |
| `src/utils/error/`                   | 错误归一化与发射                                |

## 默认行为

### 基础能力

- 默认 base URL 为 `/api`
- Electron 渲染进程在生产环境下会走桌面服务地址
- 默认启用超时、重试、请求取消

### 缓存

- GET 请求默认启用缓存
- 登录态请求默认使用 `auth` 命名空间
- 公共请求落在 `public` 命名空间

### 登录态

- 会从 `useUserStore()` 读取 cookie
- 可将 cookie 自动注入请求参数
- 收到 `301 / 401 / 502` 等登录失效信号时，会尝试清理本地登录态

## 业务 API 默认用法

新增 Netease 业务 API 模块不要直接 import 默认 `request` 实例。优先使用共享 helper，让请求走 `services.api()`，这样 Web / Electron 路径、cookie 注入和登录态处理保持一致：

```ts
import { neteaseRequest, withTimestamp } from '@/api/shared/neteaseServiceRequest'

export function getSongDetail(ids: string) {
  return neteaseRequest('/song/detail', withTimestamp({ ids }))
}
```

如果模块需要测试替身，使用显式 `deps` 注入 `Pick<ApiService, 'request'>`，不要在模块顶层缓存 `services.api()`。

### 数据返回格式

请求层可以拿到任意外部服务的原始响应，但业务层不应该依赖 QQ 音乐、网易云音乐或某个第三方插件的原始结构。平台 API 模块、内置插件和外部插件需要先把响应映射为框架内部通用模型：

- `Song`
- `SearchResult`
- `LyricResult`
- `PlaylistDetail`

通用模型定义在 [`packages/shared/types/schemas.ts`](./../packages/shared/types/schemas.ts)，renderer 侧适配器接口定义在 [`src/platform/music/interface.ts`](./../src/platform/music/interface.ts)。插件桥接层的归一化逻辑只是保护边界，用来兜住缺字段、类型不稳或旧插件返回值；新插件和新来源应主动返回通用模型。

平台专属信息不要直接扩散到 store、组件或服务接口里。确实需要保留的原始字段优先放进 `extra`，等它变成跨来源通用能力后再提升为标准字段。

## 默认请求实例

```ts
import request from '@/utils/http'

const result = await request.get('/song/detail', {
  params: { ids: '12345' }
})
```

禁用缓存：

```ts
await request.get('/search', {
  params: { keywords: '周杰伦' },
  cache: false
})
```

关闭自动取消：

```ts
await request.get('/search', {
  params: { keywords: '林俊杰' },
  cancel: false
})
```

覆盖重试次数：

```ts
await request.get('/playlist/detail', {
  params: { id: 123 },
  retry: 1
})
```

## 常用导出

```ts
import request, {
  AUTH_REQUEST_CACHE_NAMESPACE,
  cancelAllRequests,
  cancelRequestsByUrl,
  clearCacheNamespaces,
  clearCookieCache,
  clearRequestCache,
  cleanupExpiredCache,
  createLatestRequestController,
  getActiveRequestCount,
  getCacheStats
} from '@/utils/http'
```

默认 `request` 实例主要用于请求层内部、兼容导出、缓存/取消工具和少量非 Netease 业务边界。新增 Netease API 文件直连 `@/utils/http` 会被 `check:architecture` 阻止。

## 什么时候使用 `createTransport()`

当你需要新增一个和默认网易云请求实例不同的客户端时，再使用 `createTransport()`：

- 不同服务标识
- 不同 base URL / cookie 注入策略
- 不同错误发射策略
- 自定义请求 / 响应拦截器

## 约束

- 不要在组件内自行拼装 axios 实例绕过 `src/utils/http/`
- 不要在新增 Netease API 模块中直接 import `@/utils/http`
- 不要在页面层重复实现 cookie、重试、缓存和取消逻辑
- 请求错误优先复用 `src/utils/error/` 统一归一化能力

## 相关文档

- [服务层设计](/architecture/service-layer)
- [错误处理](/architecture/error-handling)
- [API 文档](/reference/api)
