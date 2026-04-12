# 请求层说明

LUO Music 的请求层已经从旧的 `request.js` 方案收敛到 `src/utils/http/`。当前默认网易云请求客户端定义在 `src/utils/http/index.ts`，底层工厂在 `src/utils/http/transportFactory.ts`。

## 设计目标

- 统一浏览器与 Electron 渲染进程的请求入口
- 收敛缓存、取消、重试和 cookie 注入逻辑
- 在登录态失效时统一触发本地会话清理
- 为后续平台扩展保留 `createTransport()` 工厂能力

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

## 基本用法

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

## 什么时候使用 `createTransport()`

当你需要新增一个和默认网易云请求实例不同的客户端时，再使用 `createTransport()`：

- 不同服务标识
- 不同 base URL / cookie 注入策略
- 不同错误发射策略
- 自定义请求 / 响应拦截器

## 约束

- 不要在组件内自行拼装 axios 实例绕过 `src/utils/http/`
- 不要在页面层重复实现 cookie、重试、缓存和取消逻辑
- 请求错误优先复用 `src/utils/error/` 统一归一化能力

## 相关文档

- [服务层设计](/architecture/service-layer)
- [错误处理](/architecture/error-handling)
- [API 文档](/reference/api)
