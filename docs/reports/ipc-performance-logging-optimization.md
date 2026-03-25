# IPC 性能监控日志优化总结

## 优化日期

2026-03-23

## 问题描述

原始实现中，每个慢请求都会直接输出日志，带来几个明显问题：

- 高频通道会产生大量重复日志
- 日志文件增长过快
- 真正异常的请求容易被淹没
- 很难从单条日志看出整体性能趋势

## 解决方案

### 1. 日志采样（Log Sampling）

**实现**：同一通道在 30 秒内只记录一次慢请求告警。

```typescript
/** 日志采样间隔（毫秒）- 同一通道的重复告警最小间隔 */
const LOG_SAMPLE_INTERVAL = 30 * 1000 // 30 秒

private lastLogTime = new Map<string, number>()

private shouldLog(channel: string): boolean {
  const now = Date.now()
  const lastLog = this.lastLogTime.get(channel) || 0

  if (now - lastLog >= LOG_SAMPLE_INTERVAL) {
    this.lastLogTime.set(channel, now)
    return true
  }

  return false
}
```

**效果**：

- 单个通道每分钟最多输出 2 条慢请求日志
- 保留首次告警，方便快速定位问题
- 避免高频通道刷屏

### 2. 聚合日志输出（Aggregated Logging）

**实现**：每 5 分钟输出一次慢请求汇总。

```typescript
/** 聚合日志输出间隔（毫秒） */
const AGGREGATED_LOG_INTERVAL = 5 * 60 * 1000 // 5 分钟

private aggregatedStats = new Map<string, { count: number; totalDuration: number }>()

private flushAggregatedStats(): void {
  const summary = entries
    .map(([channel, stats]) => {
      const avg = Math.round(stats.totalDuration / stats.count)
      return `${channel}: ${stats.count} 次 (平均 ${avg}ms)`
    })
    .join('; ')

  logger.info(
    `[Performance] 慢请求汇总 (${AGGREGATED_LOG_INTERVAL / 1000 / 60} 分钟): ${summary}`
  )
}
```

**输出示例**：

```text
[Performance] 慢请求汇总 (5 分钟): api:search: 15 次 (平均 245ms); api:play: 8 次 (平均 180ms)
```

**效果**：

- 提供全局视角，快速看出最慢的通道
- 在减少日志条数的同时保留统计信息
- 更适合做阶段性性能分析

### 3. 高频通道过滤

**保持不变**：继续过滤以下高频通道，避免无意义噪声。

- `lyric-time-update` - 歌词时间更新
- `player-sync-state` - 播放器状态同步
- `music-playing-check` - 播放状态检查

### 4. 资源清理

**新增**：进程退出时清理定时器，并在退出前刷新聚合日志。

```typescript
dispose(): void {
  if (this.aggregatedLogTimer) {
    clearInterval(this.aggregatedLogTimer)
    this.aggregatedLogTimer = null
  }

  // 退出前刷新聚合统计
  this.flushAggregatedStats()
}
```

## 修改的文件

| 文件                                                        | 修改内容                         |
| ----------------------------------------------------------- | -------------------------------- |
| `electron/ipc/middleware/performance.ts`                    | 添加日志采样、聚合输出、资源清理 |
| `electron/ipc/middleware/index.ts`                          | 导出 `disposePerformanceMonitor` |
| `electron/main/index.ts`                                    | 在 `onWillQuit` 时清理资源       |
| `electron/ipc/index.ts`                                     | 更新导出                         |
| `docs/reports/ipc-performance-monitoring.md`                | 更新文档说明                     |
| `docs/reports/ipc-performance-monitoring-implementation.md` | 更新实现总结                     |

## 日志输出对比

### 优化前（示例：5 分钟内 100 个慢请求）

```text
[Performance] Slow IPC request: api:search took 1500ms
[Performance] Slow IPC request: api:search took 1600ms
[Performance] Slow IPC request: api:search took 1450ms
[Performance] Slow IPC request: api:search took 1520ms
... (96 条类似的日志)
```

**日志行数**：约 100 行

### 优化后

```text
[Performance] Slow IPC request: api:search took 1500ms
... (30 秒后)
[Performance] Slow IPC request: api:search took 1580ms
... (5 分钟后汇总)
[Performance] 慢请求汇总 (5 分钟): api:search: 100 次 (平均 1520ms)
```

**日志行数**：约 3 行，减少约 97%

## 性能影响

| 指标         | 优化前          | 优化后          | 变化       |
| ------------ | --------------- | --------------- | ---------- |
| 内存开销     | ~100 bytes/通道 | ~150 bytes/通道 | +50 bytes  |
| CPU 开销     | 可忽略          | 可忽略          | 无明显变化 |
| 日志行数     | N 条/分钟       | ~2-3 条/分钟    | -95%       |
| 日志文件增长 | 较快            | 缓慢            | 显著改善   |

## 配置参数

| 参数                          | 默认值   | 说明                       |
| ----------------------------- | -------- | -------------------------- |
| `SLOW_REQUEST_THRESHOLD`      | 1000ms   | 慢请求告警阈值             |
| `VERY_SLOW_REQUEST_THRESHOLD` | 3000ms   | 极慢请求告警阈值           |
| `LOG_SAMPLE_INTERVAL`         | 30000ms  | 日志采样间隔（30 秒）      |
| `AGGREGATED_LOG_INTERVAL`     | 300000ms | 聚合日志输出间隔（5 分钟） |

## 注意事项

1. **首次告警仍然输出**：确保异常能被及时发现。
2. **极慢请求不受采样限制**：达到 `VERY_SLOW_REQUEST_THRESHOLD` 的请求始终输出错误日志。
3. **聚合日志用于趋势分析**：适合观察阶段性性能变化，不替代单次异常定位。
4. **退出前需要刷新统计**：避免进程关闭时丢失尚未输出的聚合数据。

## 后续改进建议

1. **可配置采样间隔**：允许通过配置文件调整采样窗口。
2. **动态阈值调整**：根据历史数据自动调整告警阈值。
3. **日志级别配置**：允许通过环境变量控制输出级别。
4. **外部监控集成**：将性能统计接入外部监控系统。

---

_优化完成时间：2026-03-23_  
_测试状态：556/557 测试通过（1 个原有失败）_
