import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateService,
  deactivateService,
  getService,
  registerService,
  resetServices
} from '@/services/registry'
import { createDecorator } from '@/services/types'
import { createDeferred } from '../helpers/deferred'

const IServiceA = createDecorator<unknown>('IServiceA')
const IServiceB = createDecorator<unknown>('IServiceB')

type LifecycleService = {
  onActivate?: () => Promise<void> | void
  onDeactivate?: () => Promise<void> | void
  dispose?: () => void
}

const ILifecycleService = createDecorator<LifecycleService>('ITestLifecycleService')

async function flushLifecycleTasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('service registry lifecycle', () => {
  beforeEach(() => {
    resetServices()
  })

  it('awaits async onActivate only once per service instance', async () => {
    const calls: string[] = []
    const onActivate = vi.fn(async () => {
      calls.push('activate:start')
      await Promise.resolve()
      calls.push('activate:end')
    })
    const service: LifecycleService = {
      onActivate
    }

    registerService(ILifecycleService, () => service)

    const [first, second] = await Promise.all([
      activateService(ILifecycleService),
      activateService(ILifecycleService)
    ])

    expect(first).toBe(service)
    expect(second).toBe(service)
    expect(getService(ILifecycleService)).toBe(service)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['activate:start', 'activate:end'])
  })

  it('runs onDeactivate when an activated service is explicitly deactivated', async () => {
    const onActivate = vi.fn()
    const onDeactivate = vi.fn()
    const service: LifecycleService = {
      onActivate,
      onDeactivate
    }

    registerService(ILifecycleService, () => service)

    await activateService(ILifecycleService)
    await deactivateService(ILifecycleService)

    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onDeactivate).toHaveBeenCalledTimes(1)
  })

  it('best-effort deactivates activated services during reset before disposing them', async () => {
    const onActivate = vi.fn()
    const onDeactivate = vi.fn()
    const dispose = vi.fn()
    const service: LifecycleService = {
      onActivate,
      onDeactivate,
      dispose
    }

    registerService(ILifecycleService, () => service)

    await activateService(ILifecycleService)
    resetServices()
    await flushLifecycleTasks()

    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('does not let an old activation mark a re-registered instance as already activated', async () => {
    const firstActivation = createDeferred()
    const firstService: LifecycleService = {
      onActivate: vi.fn(() => firstActivation.promise),
      onDeactivate: vi.fn()
    }
    const secondService: LifecycleService = {
      onActivate: vi.fn(),
      onDeactivate: vi.fn()
    }

    registerService(ILifecycleService, () => firstService)
    const staleActivation = activateService(ILifecycleService)

    registerService(ILifecycleService, () => secondService)
    await activateService(ILifecycleService)

    firstActivation.resolve()
    await staleActivation

    expect(firstService.onActivate).toHaveBeenCalledTimes(1)
    expect(secondService.onActivate).toHaveBeenCalledTimes(1)
  })

  it('waits for async onDeactivate before disposing a replaced instance', async () => {
    const calls: string[] = []
    const deactivation = createDeferred()
    const firstService: LifecycleService = {
      onActivate: vi.fn(),
      onDeactivate: vi.fn(async () => {
        calls.push('deactivate:start')
        await deactivation.promise
        calls.push('deactivate:end')
      }),
      dispose: vi.fn(() => {
        calls.push('dispose')
      })
    }
    const secondService: LifecycleService = {
      onActivate: vi.fn()
    }

    registerService(ILifecycleService, () => firstService)
    await activateService(ILifecycleService)

    registerService(ILifecycleService, () => secondService)
    await flushLifecycleTasks()

    expect(calls).toEqual(['deactivate:start'])

    deactivation.resolve()
    await flushLifecycleTasks()

    expect(calls).toEqual(['deactivate:start', 'deactivate:end', 'dispose'])
  })

  it('throws an error when circular dependency is detected', () => {
    registerService(IServiceA, () => {
      // ServiceA depends on ServiceB
      getService(IServiceB)
      return { name: 'A' }
    })

    registerService(IServiceB, () => {
      // ServiceB depends on ServiceA (circular)
      getService(IServiceA)
      return { name: 'B' }
    })

    expect(() => getService(IServiceA)).toThrow(
      '[Services] Circular dependency detected: IServiceA -> IServiceB -> IServiceA'
    )
  })

  it('correctly resolves non-circular dependencies', () => {
    const serviceBInstance = { name: 'B' }
    registerService(IServiceB, () => serviceBInstance)

    registerService(IServiceA, () => {
      // ServiceA depends on ServiceB (no circular)
      const serviceB = getService(IServiceB)
      return { name: 'A', dependsOn: serviceB }
    })

    const serviceA = getService(IServiceA)
    expect(serviceA).toEqual({ name: 'A', dependsOn: { name: 'B' } })
  })

  it('invalidates service accessor cache after resetServicesAsync', async () => {
    const { services, resetServicesAsync, setupServices } = await import('@/services')

    // 第一次获取服务实例
    const firstMusicInstance = services.music()
    expect(firstMusicInstance).toBeDefined()

    // 重置服务
    await resetServicesAsync()

    // 重新初始化
    setupServices()

    // 再次获取服务实例 - 应该返回新实例
    const secondMusicInstance = services.music()
    expect(secondMusicInstance).toBeDefined()
    // 由于服务被重新创建，实例应该不同
    expect(secondMusicInstance).not.toBe(firstMusicInstance)
  })
})
