# 统一服务层方案（MVP）

## 目标
统一平台能力、IPC、API 访问与日志入口，降低耦合，为后续插件/扩展打基础，同时保持现有行为不变。

## 范围（MVP）
- 新增 `src/services/` 目录
- 引入服务注册与统一访问入口
- 迁移少量高频调用点到服务层（不改业务逻辑）

## 目录结构
- `src/services/registry.ts`  
  服务注册、发现与生命周期管理
- `src/services/index.ts`  
  统一对外导出
- `src/services/platformService.ts`  
  平台能力封装（Electron/Web）
- `src/services/apiService.ts`  
  统一 API 访问入口
- `src/services/loggerService.ts`  
  统一日志入口
- `src/services/errorService.ts`  
  统一错误处理入口
- `src/services/configService.ts`  
  配置中心化入口（预留）

## 设计原则
- 行为一致：不改变现有用户可见行为
- 变更最小：只替换调用入口
- 接口稳定：便于后续扩展

## 接口草案（MVP）
### PlatformService
- `isElectron(): boolean`
- `send(channel: string, data: unknown): void`
- `on(channel: string, handler: (data: unknown) => void): () => void`
- `getCacheSize(): Promise<unknown>`
- `clearCache(options?: unknown): Promise<unknown>`

### ApiService
- `request(service: string, endpoint: string, params?: Record<string, unknown>): Promise<unknown>`

### LoggerService
- `info(module: string, message: string, data?: unknown): void`
- `warn(module: string, message: string, data?: unknown): void`
- `error(module: string, message: string, data?: unknown): void`
- `debug(module: string, message: string, data?: unknown): void`

### ErrorService
- `emit(error: AppError | Error | unknown): void`
- `on(code: ErrorCode, handler: (error: AppError) => void | Promise<void>): void`
- `onAny(handler: (error: AppError) => void | Promise<void>): void`
- `handleError(...)`
- `handleApiError(...)`
- `handlePlayerError(...)`
- `handleNetworkError(...)`
- `withErrorHandling(...)`

#### 使用示例
```ts
import { services } from '@/services'
import { ErrorCode } from '@/utils/error'

const errorService = services.error()

errorService.on(ErrorCode.NETWORK_OFFLINE, (err) => {
  console.warn('Network error:', err.getUserMessage())
})

try {
  throw new Error('test')
} catch (error) {
  errorService.emit(error)
}
```

### ConfigService
- `get(): AppConfig`
- `getPort(name: 'qq' | 'netease'): number`

> 注意：当前仅完成服务抽象与注册，暂未在业务侧使用。

## 实施步骤
1. 建立服务注册与统一出口
2. 实现 Platform / API / Logger 服务
3. 先迁移少量高频调用点
4. 验证构建与运行
5. 分批迁移其他模块

## Mock 注入（测试）
`setupServices` 支持注入 mock，便于在测试环境替换真实实现。

```ts
import { setupServices } from '@/services'

setupServices({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
})
```

## 非目标（MVP）
- 不引入插件模型或扩展宿主
- 不调整现有 Store 结构
- 不做大规模重构
