/**
 * 服务性能监控器
 * 用于追踪服务初始化时间、调用次数等性能指标
 */

/**
 * 服务性能指标
 */
export interface ServiceMetrics {
  /** 服务名称 */
  name: string
  /** 初始化时间 (ms) */
  initTime: number
  /** 被获取的次数 */
  getCount: number
  /** 最后一次获取的时间戳 */
  lastAccessTime?: number
  /** 是否是单例 */
  isSingleton: boolean
}

/**
 * 性能监控数据结构
 */
interface PerformanceData {
  /** 服务指标 Map */
  metrics: Map<string, ServiceMetrics>
  /** 服务初始化时间记录 */
  initTimestamps: Map<string, number>
  /** 监控是否启用 */
  enabled: boolean
}

const data: PerformanceData = {
  metrics: new Map(),
  initTimestamps: new Map(),
  enabled: true
}

/**
 * 初始化服务的性能追踪
 * @param serviceName 服务名称
 */
export function trackServiceInit(serviceName: string): void {
  if (!data.enabled) return

  data.initTimestamps.set(serviceName, performance.now())

  if (!data.metrics.has(serviceName)) {
    data.metrics.set(serviceName, {
      name: serviceName,
      initTime: 0,
      getCount: 0,
      isSingleton: true
    })
  }
}

/**
 * 记录服务初始化完成
 * @param serviceName 服务名称
 */
export function completeServiceInit(serviceName: string): void {
  if (!data.enabled) return

  const startTime = data.initTimestamps.get(serviceName)
  if (startTime === undefined) return

  const initTime = performance.now() - startTime
  const metrics = data.metrics.get(serviceName)!
  metrics.initTime = initTime

  data.initTimestamps.delete(serviceName)
}

/**
 * 记录服务被获取
 * @param serviceName 服务名称
 */
export function trackServiceGet(serviceName: string): void {
  if (!data.enabled) return

  const metrics = data.metrics.get(serviceName)
  if (metrics) {
    metrics.getCount++
    metrics.lastAccessTime = performance.now()
  }
}

/**
 * 获取单个服务的性能指标
 * @param serviceName 服务名称
 */
export function getServiceMetrics(serviceName: string): ServiceMetrics | undefined {
  return data.metrics.get(serviceName)
}

/**
 * 获取所有服务的性能指标
 * @returns 服务指标数组，按初始化时间排序
 */
export function getAllServiceMetrics(): ServiceMetrics[] {
  return Array.from(data.metrics.values()).sort((a, b) => b.initTime - a.initTime)
}

/**
 * 获取性能报告（表格形式）
 * @returns 格式化的性能报告字符串
 */
export function getPerformanceReport(): string {
  if (!data.enabled) {
    return 'Performance monitoring is disabled'
  }

  const metrics = getAllServiceMetrics()
  if (metrics.length === 0) {
    return 'No service metrics available'
  }

  const totalTime = metrics.reduce((sum, m) => sum + m.initTime, 0)
  const totalGets = metrics.reduce((sum, m) => m.getCount, 0)

  let report = '\n=== Service Performance Report ===\n\n'
  report += `Total Services: ${metrics.length}\n`
  report += `Total Init Time: ${totalTime.toFixed(2)}ms\n`
  report += `Total Get Calls: ${totalGets}\n\n`

  report += 'Service Details (sorted by init time):\n'
  report += '┌─────────────────────┬──────────────┬────────────┬───────────┐\n'
  report += '│ Service Name        │ Init Time(ms)│ Get Count  │ Singleton │\n'
  report += '├─────────────────────┼──────────────┼────────────┼───────────┤\n'

  for (const m of metrics) {
    const name = m.name.padEnd(19)
    const initTime = m.initTime.toFixed(2).padStart(10)
    const getCount = String(m.getCount).padStart(10)
    const singleton = String(m.isSingleton).padEnd(9)
    report += `│ ${name} │ ${initTime} │ ${getCount} │ ${singleton} │\n`
  }

  report += '└─────────────────────┴──────────────┴────────────┴───────────┘\n'

  return report
}

/**
 * 打印性能报告到控制台
 */
export function printPerformanceReport(): void {
  console.log(getPerformanceReport())
}

/**
 * 获取初始化最慢的服务
 * @param limit 返回数量
 */
export function getSlowestServices(limit = 5): ServiceMetrics[] {
  return getAllServiceMetrics().slice(0, limit)
}

/**
 * 获取最常被获取的服务
 * @param limit 返回数量
 */
export function getMostUsedServices(limit = 5): ServiceMetrics[] {
  return Array.from(data.metrics.values())
    .sort((a, b) => b.getCount - a.getCount)
    .slice(0, limit)
}

/**
 * 启用性能监控
 */
export function enableMonitoring(): void {
  data.enabled = true
}

/**
 * 禁用性能监控
 */
export function disableMonitoring(): void {
  data.enabled = false
}

/**
 * 重置所有监控数据
 */
export function resetMetrics(): void {
  data.metrics.clear()
  data.initTimestamps.clear()
}
