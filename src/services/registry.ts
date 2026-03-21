/**
 * 服务注册表 - 支持 ServiceIdentifier 和字符串 ID 两种方式
 * 参考 VSCode 的 ServiceCollection 实现
 */

import type { ServiceIdentifier, ServiceId } from './types'
import { SERVICE_ID_MAP } from './types'
import {
  trackServiceInit,
  completeServiceInit,
  trackServiceGet,
  resetMetrics
} from './performanceMonitor'

// 重新导出 ServiceId 类型
export type { ServiceId }

/**
 * 依赖图 - 用于检测循环依赖
 * 参考 VS Code 的 Graph 实现
 */
class DependencyGraph {
  private nodes = new Set<string>()
  private edges = new Map<string, Set<string>>()

  addNode(node: string): void {
    if (!this.nodes.has(node)) {
      this.nodes.add(node)
      this.edges.set(node, new Set())
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from)
    this.addNode(to)
    this.edges.get(from)!.add(to)
  }

  removeNode(node: string): void {
    this.nodes.delete(node)
    this.edges.delete(node)
    this.edges.forEach(deps => deps.delete(node))
  }

  /**
   * 检测是否有循环依赖
   * @returns 循环依赖路径，如果没有则返回 null
   */
  detectCycle(): string[] | null {
    const WHITE = 0 // 未访问
    const GRAY = 1 // 正在访问
    const BLACK = 2 // 已完成

    const color = new Map<string, number>()
    const parent = new Map<string, string>()

    for (const node of this.nodes) {
      color.set(node, WHITE)
    }

    for (const startNode of this.nodes) {
      if (color.get(startNode) !== WHITE) continue

      const stack: string[] = [startNode]
      while (stack.length > 0) {
        const node = stack[stack.length - 1]

        if (color.get(node) === WHITE) {
          color.set(node, GRAY)
          const deps = this.edges.get(node) || new Set()
          for (const dep of deps) {
            if (color.get(dep) === GRAY) {
              // 找到循环，重建路径
              const cycle: string[] = [dep]
              let current = node
              while (current !== dep) {
                cycle.push(current)
                current = parent.get(current)!
              }
              cycle.push(dep)
              return cycle.reverse()
            }
            if (color.get(dep) === WHITE) {
              parent.set(dep, node)
              stack.push(dep)
            }
          }
        } else if (color.get(node) === GRAY) {
          color.set(node, BLACK)
          stack.pop()
        } else {
          stack.pop()
        }
      }
    }

    return null
  }

  /**
   * 获取拓扑排序结果（依赖创建顺序）
   */
  topologicalSort(): string[] {
    const result: string[] = []
    const visited = new Set<string>()

    const visit = (node: string) => {
      if (visited.has(node)) return
      visited.add(node)

      const deps = this.edges.get(node)
      if (deps) {
        for (const dep of deps) {
          visit(dep)
        }
      }

      result.push(node)
    }

    for (const node of this.nodes) {
      visit(node)
    }

    return result
  }

  clear(): void {
    this.nodes.clear()
    this.edges.clear()
  }
}

type ServiceFactory<T> = () => T

type DisposableLike = {
  dispose(): void
}

// 使用 ServiceIdentifier 作为 Key
const factories = new Map<ServiceIdentifier<unknown>, ServiceFactory<unknown>>()
const instances = new Map<ServiceIdentifier<unknown>, unknown>()
const graph = new DependencyGraph()

// 当前正在创建的服务栈（用于检测循环依赖）
const creatingStack: string[] = []

function isDisposableLike(value: unknown): value is DisposableLike {
  return typeof value === 'object' && value !== null && 'dispose' in value
}

function disposeServiceInstance(identifierName: string, instance: unknown): void {
  if (!isDisposableLike(instance) || typeof instance.dispose !== 'function') {
    return
  }

  try {
    instance.dispose()
  } catch (error) {
    console.warn(`[Services] Failed to dispose service "${identifierName}"`, error)
  }
}

/**
 * 注册服务 - 支持 ServiceIdentifier 和字符串 ID 两种方式
 *
 * @example
 * ```typescript
 * // 方式 1：使用 ServiceIdentifier（推荐，类型安全）
 * registerService(IApiService, createApiService)
 *
 * // 方式 2：使用字符串 ID（向后兼容）
 * registerService('api', createApiService)
 * ```
 */
export function registerService<T>(
  id: ServiceIdentifier<T> | ServiceId,
  factory: ServiceFactory<T>
): void {
  const identifier = toIdentifier(id)
  const existing = instances.get(identifier)

  if (existing !== undefined) {
    disposeServiceInstance(identifier.name, existing)
  }

  factories.set(identifier, factory as ServiceFactory<unknown>)
  instances.delete(identifier)

  // 注册依赖图节点
  graph.addNode(identifier.name)
}

/**
 * 获取服务 - 支持 ServiceIdentifier 和字符串 ID 两种方式
 *
 * @example
 * ```typescript
 * // 方式 1：使用 ServiceIdentifier（推荐，类型安全）
 * const api = getService(IApiService)
 *
 * // 方式 2：使用字符串 ID（向后兼容）
 * const api = getService('api')
 * ```
 */
export function getService<T>(id: ServiceIdentifier<T> | ServiceId): T {
  const identifier = toIdentifier(id)
  const existing = instances.get(identifier)
  if (existing) {
    // 记录已存在服务的获取
    trackServiceGet(identifier.name)
    return existing as T
  }

  const idName = identifier.name

  // 检测循环依赖
  if (creatingStack.includes(idName)) {
    const cycle = [...creatingStack, idName]
    creatingStack.length = 0 // 清空栈
    throw new Error(
      `[Services] Circular dependency detected: ${cycle.join(' → ')}\n` +
        'Consider refactoring services to avoid circular dependencies.'
    )
  }

  const factory = factories.get(identifier)
  if (!factory) {
    throw new Error(`[Services] Service "${idName}" is not registered`)
  }

  // 记录正在创建的服务
  creatingStack.push(idName)

  try {
    // 开始追踪初始化时间
    trackServiceInit(idName)

    const instance = factory()
    instances.set(identifier, instance)

    // 完成初始化追踪
    completeServiceInit(idName)

    // 记录服务获取
    trackServiceGet(idName)

    return instance as T
  } finally {
    // 创建完成后从栈中移除
    creatingStack.pop()
  }
}

/**
 * 重置所有服务（用于测试）
 */
export function resetServices(): void {
  for (const [identifier, instance] of instances.entries()) {
    disposeServiceInstance(identifier.name, instance)
  }

  instances.clear()
  graph.clear()
  creatingStack.length = 0
  resetMetrics()
}

/**
 * 获取服务注册状态
 */
export function isRegistered(id: ServiceIdentifier<unknown> | ServiceId): boolean {
  const identifier = toIdentifier(id)
  return factories.has(identifier)
}

/**
 * 将 ServiceId 或 ServiceIdentifier 转换为 ServiceIdentifier
 */
function toIdentifier<T>(id: ServiceIdentifier<T> | ServiceId): ServiceIdentifier<T> {
  if (typeof id === 'string') {
    const identifier = SERVICE_ID_MAP[id as ServiceId]
    if (!identifier) {
      throw new Error(`[Services] Unknown service ID: "${id}"`)
    }
    return identifier as ServiceIdentifier<T>
  }
  return id
}

/**
 * 获取已注册服务的名称列表
 */
export function getRegisteredServices(): string[] {
  return Array.from(factories.keys()).map(id => id.name)
}
