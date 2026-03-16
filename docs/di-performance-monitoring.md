# 依赖注入性能监控使用指南

## 概述

性能监控模块用于追踪服务的初始化时间和调用次数，帮助识别性能瓶颈和优化机会。

## API 使用

### 1. 查看性能报告

```typescript
import { printPerformanceReport, getPerformanceReport } from '@/services'

// 打印到控制台
printPerformanceReport()

// 获取格式化的报告字符串
const report = getPerformanceReport()
console.log(report)
```

**输出示例：**
```
=== Service Performance Report ===

Total Services: 6
Total Init Time: 45.23ms
Total Get Calls: 15

Service Details (sorted by init time):
┌─────────────────────┬──────────────┬────────────┬───────────┐
│ Service Name        │ Init Time(ms)│ Get Count  │ Singleton │
├─────────────────────┼──────────────┼────────────┼───────────┤
│ IPlatformService    │       12.45  │          3 │ true      │
│ IApiService         │        8.32  │          5 │ true      │
│ ILoggerService      │        5.67  │          4 │ true      │
│ IConfigService      │        4.21  │          1 │ true      │
│ IErrorService       │        3.89  │          1 │ true      │
│ ICommandService     │        2.45  │          1 │ true      │
└─────────────────────┴──────────────┴────────────┴───────────┘
```

### 2. 获取单个服务指标

```typescript
import { getServiceMetrics } from '@/services'

const metrics = getServiceMetrics('IApiService')
if (metrics) {
  console.log(`初始化时间：${metrics.initTime}ms`)
  console.log(`被调用次数：${metrics.getCount}`)
  console.log(`最后访问时间：${metrics.lastAccessTime}`)
}
```

### 3. 获取最慢的服务

```typescript
import { getSlowestServices } from '@/services'

// 获取初始化最慢的 3 个服务
const slowest = getSlowestServices(3)
slowest.forEach(service => {
  console.log(`${service.name}: ${service.initTime}ms`)
})
```

### 4. 获取最常用的服务

```typescript
import { getMostUsedServices } from '@/services'

// 获取被调用最频繁的 3 个服务
const mostUsed = getMostUsedServices(3)
mostUsed.forEach(service => {
  console.log(`${service.name}: ${service.getCount} 次`)
})
```

### 5. 控制监控开关

```typescript
import { enableMonitoring, disableMonitoring } from '@/services'

// 禁用监控（用于生产环境或测试）
disableMonitoring()

// 启用监控
enableMonitoring()
```

### 6. 重置监控数据

```typescript
import { resetMetrics } from '@/services'

// 重置所有监控数据（用于测试前清理）
resetMetrics()
```

## 在开发者工具中集成

可以在应用启动时自动打印性能报告：

```typescript
// main.ts
import { printPerformanceReport, setupServices } from '@/services'

setupServices()

// 在服务初始化完成后打印报告
printPerformanceReport()
```

## 性能优化建议

1. **初始化时间过长**：如果某个服务初始化时间超过 100ms，考虑：
   - 懒加载该服务
   - 异步初始化
   - 缓存昂贵的计算结果

2. **调用频繁的服务**：对于 `getCount` 很高的服务，考虑：
   - 确保是单例模式
   - 添加方法调用缓存
   - 减少不必要的服务获取

3. **循环依赖检测**：性能监控会记录依赖创建顺序，有助于分析循环依赖问题

## 测试示例

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { getServiceMetrics, resetMetrics } from '@/services'
import { setupServices } from '@/services'

describe('Service Performance', () => {
  beforeEach(() => {
    resetMetrics()
  })

  it('should initialize services within acceptable time', () => {
    setupServices()

    const metrics = getServiceMetrics('IApiService')
    expect(metrics!.initTime).toBeLessThan(100) // 100ms 阈值
  })
})
```

## 注意事项

- 性能监控有轻微的性能开销（每次服务获取约 0.01ms）
- 生产环境可以考虑禁用监控
- 监控数据存储在内存中，刷新页面后会重置
