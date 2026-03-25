# IPC 性能监控使用指南

## 概述

IPC 性能监控功能用于检测和分析 Electron 主进程与渲染进程之间的通信性能，帮助发现慢请求和性能瓶颈。

## 功能特性

### 1. 慢请求检测

- **默认阈值**: 1000ms (可配置)
- **告警级别**:
  - ≥1000ms: WARN 级别日志
  - ≥3000ms: ERROR 级别日志
- **日志采样**: 同一通道 30 秒内只记录一次告警（避免重复 spam）
- **高频通道过滤**: 自动过滤 `lyric-time-update`、`player-sync-state` 等高频通道

### 2. 聚合日志输出

- **输出间隔**: 每 5 分钟汇总输出一次
- **汇总内容**: 每个通道的慢请求次数和平均耗时
- **示例**:
  ```
  [Performance] 慢请求汇总 (5 分钟): api:search: 15 次 (平均 245ms); api:play: 8 次 (平均 180ms)
  ```

### 2. 性能指标收集

每个 IPC 通道自动收集以下指标:

| 指标                 | 说明             |
| -------------------- | ---------------- |
| `totalRequests`      | 请求总数         |
| `successfulRequests` | 成功请求数       |
| `failedRequests`     | 失败请求数       |
| `avgDuration`        | 平均耗时 (ms)    |
| `minDuration`        | 最小耗时 (ms)    |
| `maxDuration`        | 最大耗时 (ms)    |
| `slowRequests`       | 慢请求数量       |
| `lastRequestTime`    | 最近一次请求时间 |

### 3. 性能报告

提供聚合的性能分析报告，包括:

- 总体统计摘要
- 最慢的 TOP 10 通道排行
- 慢请求总数

## 使用方法

### 基本配置

在 `electron/main/index.ts` 中配置:

```typescript
import { ipcService, performanceMiddleware } from '../ipc/index'

function initializeIpcService(): void {
  ipcService.configure({
    defaultTimeout: 10000, // 请求超时 (ms)
    slowRequestThreshold: 1000, // 慢请求阈值 (ms)
    enablePerformanceMonitoring: true // 启用性能监控
  })

  // 注册性能监控中间件
  ipcService.use(performanceMiddleware)

  // ... 其他初始化代码
}
```

### 运行时查询指标

#### 1. 获取单个通道的指标

```typescript
import { getPerformanceMetrics } from '../ipc/index'

const metrics = getPerformanceMetrics('api:search')
console.log(metrics)
// {
//   channel: 'api:search',
//   totalRequests: 100,
//   successfulRequests: 98,
//   failedRequests: 2,
//   avgDuration: 245.6,
//   minDuration: 50,
//   maxDuration: 1500,
//   slowRequests: 3,
//   lastRequestTime: 1711234567890
// }
```

#### 2. 获取所有通道的指标

```typescript
import { getPerformanceMetrics } from '../ipc/index'

const allMetrics = getPerformanceMetrics()
for (const [channel, metrics] of allMetrics) {
  console.log(`${channel}: avg=${metrics.avgDuration.toFixed(2)}ms`)
}
```

#### 3. 获取慢请求列表

```typescript
import { getSlowRequests } from '../ipc/index'

const slowRequests = getSlowRequests(50) // 获取最近 50 条
slowRequests.forEach(req => {
  console.warn(
    `[Slow Request] ${req.channel} took ${req.duration}ms at ${new Date(req.timestamp).toISOString()}`
  )
})
```

#### 4. 获取性能报告

```typescript
import { getPerformanceReport } from '../ipc/index'

const report = getPerformanceReport()
console.log('=== 性能摘要 ===')
console.log(`总通道数：${report.summary.totalChannels}`)
console.log(`总请求数：${report.summary.totalRequests}`)
console.log(`平均耗时：${report.summary.avgDuration.toFixed(2)}ms`)
console.log(`慢请求数：${report.summary.slowRequestCount}`)

console.log('\n=== 最慢的通道 TOP 5 ===')
report.slowestChannels.slice(0, 5).forEach(ch => {
  console.log(`${ch.channel}: ${ch.avgDuration}ms (${ch.totalRequests} 次请求)`)
})
```

#### 5. 重置指标

```typescript
import { resetPerformanceMetrics } from '../ipc/index'

// 重置特定通道
resetPerformanceMetrics('api:search')

// 重置所有通道
resetPerformanceMetrics()
```

## 中间件配置说明

### 中间件顺序

中间件按照注册顺序执行。建议的顺序是:

```typescript
ipcService.use(errorMiddleware) // 错误处理 (最外层)
ipcService.use(loggerMiddleware) // 日志记录
ipcService.use(performanceMiddleware) // 性能监控
```

### 跳过高频通道

性能监控中间件会自动跳过以下高频通道的慢请求日志:

- `lyric-time-update` - 歌词时间更新
- `player-sync-state` - 播放器状态同步
- `music-playing-check` - 播放状态检查

如需添加更多跳过的通道，修改 `middleware/performance.ts`:

```typescript
function isHighFrequencyChannel(channel: string): boolean {
  const highFrequencyChannels = new Set([
    'lyric-time-update',
    'player-sync-state',
    'music-playing-check',
    'your-channel-here' // 添加新通道
  ])
  return highFrequencyChannels.has(channel)
}
```

## 性能调优建议

### 1. 监控告警阈值

根据应用实际情况调整阈值:

```typescript
// 开发环境：更严格的阈值
if (process.env.NODE_ENV === 'development') {
  ipcService.configure({
    slowRequestThreshold: 500 // 500ms 就告警
  })
}

// 生产环境：宽松阈值
ipcService.configure({
  slowRequestThreshold: 2000 // 2000ms 才告警
})
```

### 2. 定期收集指标

建议在主进程中定期收集并记录性能指标:

```typescript
import logger from './logger'
import { getPerformanceReport } from './ipc/index'

// 每 5 分钟记录一次性能报告
setInterval(
  () => {
    const report = getPerformanceReport()
    logger.info('[Performance Report]', JSON.stringify(report.summary, null, 2))

    if (report.summary.slowRequestCount > 0) {
      logger.warn(
        `[Performance] ${report.summary.slowRequestCount} slow requests in last 5 minutes`
      )
    }

    resetPerformanceMetrics() // 重置指标开始新的周期
  },
  5 * 60 * 1000
)
```

### 3. 集成到监控系统

可以将性能数据发送到外部监控系统:

```typescript
import { sendToMonitoring } from './monitoring'

const report = getPerformanceReport()
sendToMonitoring('ipc-performance', {
  timestamp: Date.now(),
  ...report.summary,
  topSlowChannels: report.slowestChannels.slice(0, 5)
})
```

## 故障排查

### 问题 1: 日志中出现大量慢请求告警

**可能原因**:

1. 阈值设置过低
2. 主进程负载过高
3. 某些 IPC 请求执行了耗时操作

**排查步骤**:

1. 使用 `getPerformanceReport()` 查看具体哪些通道慢
2. 检查对应通道的 handler 实现
3. 考虑优化耗时操作或增加超时阈值

### 问题 2: 性能监控影响应用性能

**可能原因**:

- 指标收集本身有开销 (通常 < 1ms)

**解决方案**:

```typescript
ipcService.configure({
  enablePerformanceMonitoring: false // 禁用监控
})
```

### 问题 3: 高频通道日志 spam

确保这些通道在 `isHighFrequencyChannel()` 的跳过列表中:

```typescript
const highFrequencyChannels = new Set([
  'lyric-time-update',
  'player-sync-state'
  // ... 添加其他高频通道
])
```

## API 参考

### `performanceMiddleware`

性能监控中间件，注册到 IPC 服务中自动生效。

### `getPerformanceMetrics(channel?: string)`

获取性能指标。

**参数**:

- `channel` (可选): 通道名称，省略时返回所有通道的指标

**返回**:

- 单个通道的 `PerformanceMetrics` 对象，或所有通道的 `Map`

### `getSlowRequests(limit?: number)`

获取慢请求列表。

**参数**:

- `limit` (可选): 最大返回数量，默认 50

**返回**:

- `SlowRequestEvent[]` 数组

### `getPerformanceReport()`

获取性能报告。

**返回**:

- 包含 `summary` 和 `slowestChannels` 的报告对象

### `resetPerformanceMetrics(channel?: string)`

重置性能指标。

**参数**:

- `channel` (可选): 通道名称，省略时重置所有通道

## 类型定义

```typescript
export interface PerformanceMetrics {
  channel: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  slowRequests: number
  lastRequestTime: number
}

export interface SlowRequestEvent {
  channel: string
  requestId: string
  duration: number
  timestamp: number
  error?: string
}

export interface PerformanceReport {
  summary: {
    totalChannels: number
    totalRequests: number
    avgDuration: number
    slowRequestCount: number
  }
  slowestChannels: Array<{
    channel: string
    avgDuration: number
    totalRequests: number
  }>
}
```

---

_文档更新时间：2026-03-23_
