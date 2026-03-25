import type { ServiceIdentifier, ServiceId } from './types'
import { SERVICE_ID_MAP } from './types'
import {
  trackServiceInit,
  completeServiceInit,
  trackServiceGet,
  resetMetrics
} from './performanceMonitor'

export type { ServiceId }

type ServiceFactory<T> = () => T

type DisposableLike = {
  dispose(): void
}

export interface ServiceLifecycle {
  onActivate?(): void | Promise<void>
  onDeactivate?(): void | Promise<void>
}

type LifecycleOperation = {
  instance: unknown
  promise: Promise<void>
}

const factories = new Map<ServiceIdentifier<unknown>, ServiceFactory<unknown>>()
const instances = new Map<ServiceIdentifier<unknown>, unknown>()
const activationOperations = new Map<ServiceIdentifier<unknown>, LifecycleOperation>()
const deactivationOperations = new Map<ServiceIdentifier<unknown>, LifecycleOperation>()
const activatedInstances = new Map<ServiceIdentifier<unknown>, unknown>()
const disposedInstances = new WeakSet<object>()

// 全局解析栈，用于检测循环依赖
const resolutionStack: string[] = []

function isDisposableLike(value: unknown): value is DisposableLike {
  return typeof value === 'object' && value !== null && 'dispose' in value
}

function isServiceLifecycleLike(value: unknown): value is ServiceLifecycle {
  return typeof value === 'object' && value !== null
}

function disposeServiceInstance(identifierName: string, instance: unknown): void {
  if (!isDisposableLike(instance) || typeof instance.dispose !== 'function') {
    return
  }

  if (typeof instance === 'object' && instance !== null) {
    if (disposedInstances.has(instance)) {
      return
    }

    disposedInstances.add(instance)
  }

  try {
    instance.dispose()
  } catch (error) {
    console.warn(`[Services] Failed to dispose service "${identifierName}"`, error)
  }
}

async function runLifecycleHook(
  identifierName: string,
  instance: unknown,
  hookName: 'onActivate' | 'onDeactivate'
): Promise<void> {
  if (!isServiceLifecycleLike(instance)) {
    return
  }

  const hook = instance[hookName]
  if (typeof hook !== 'function') {
    return
  }

  try {
    await hook.call(instance)
  } catch (error) {
    throw new Error(`[Services] Failed to ${hookName} service "${identifierName}"`, {
      cause: error
    })
  }
}

function getActivationOperation(
  identifier: ServiceIdentifier<unknown>,
  instance: unknown
): LifecycleOperation | undefined {
  const operation = activationOperations.get(identifier)
  return operation?.instance === instance ? operation : undefined
}

function getDeactivationOperation(
  identifier: ServiceIdentifier<unknown>,
  instance: unknown
): LifecycleOperation | undefined {
  const operation = deactivationOperations.get(identifier)
  return operation?.instance === instance ? operation : undefined
}

function isActivatedInstance(identifier: ServiceIdentifier<unknown>, instance: unknown): boolean {
  return activatedInstances.get(identifier) === instance
}

function clearActiveInstance(identifier: ServiceIdentifier<unknown>, instance: unknown): void {
  if (activatedInstances.get(identifier) === instance) {
    activatedInstances.delete(identifier)
  }
}

const DEACTIVATION_TIMEOUT_MS = 5000

function startInstanceDeactivation(
  identifier: ServiceIdentifier<unknown>,
  instance: unknown
): Promise<void> {
  const existingOperation = getDeactivationOperation(identifier, instance)
  if (existingOperation) {
    return existingOperation.promise
  }

  const activationPromise =
    getActivationOperation(identifier, instance)?.promise ?? Promise.resolve()

  const promise = activationPromise
    .catch(() => {})
    .then(() => {
      const deactivationPromise = runLifecycleHook(identifier.name, instance, 'onDeactivate')
      // Windows平台：添加超时保护，防止onDeactivate挂起
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`onDeactivate timeout after ${DEACTIVATION_TIMEOUT_MS}ms`))
        }, DEACTIVATION_TIMEOUT_MS)
      })
      return Promise.race([deactivationPromise, timeoutPromise])
    })
    .catch(error => {
      console.warn(`[Services] onDeactivate failed for "${identifier.name}":`, error)
      // 超时或失败时继续清理，不阻塞dispose
    })
    .finally(() => {
      clearActiveInstance(identifier, instance)

      if (getDeactivationOperation(identifier, instance)) {
        deactivationOperations.delete(identifier)
      }
    })

  deactivationOperations.set(identifier, { instance, promise })
  return promise
}

function teardownServiceInstance(identifier: ServiceIdentifier<unknown>, instance: unknown): void {
  const hasLifecycleState =
    isActivatedInstance(identifier, instance) ||
    !!getActivationOperation(identifier, instance) ||
    !!getDeactivationOperation(identifier, instance)

  if (!hasLifecycleState) {
    disposeServiceInstance(identifier.name, instance)
    return
  }

  void startInstanceDeactivation(identifier, instance)
    .catch(error => {
      console.warn(
        `[Services] Failed to asynchronously deactivate service "${identifier.name}"`,
        error
      )
    })
    .finally(() => {
      disposeServiceInstance(identifier.name, instance)
    })
}

export function registerService<T>(
  id: ServiceIdentifier<T> | ServiceId,
  factory: ServiceFactory<T>
): void {
  const identifier = toIdentifier(id)
  const existing = instances.get(identifier)

  if (existing !== undefined) {
    teardownServiceInstance(identifier, existing)
  }

  factories.set(identifier, factory as ServiceFactory<unknown>)
  instances.delete(identifier)
}

export function getService<T>(id: ServiceIdentifier<T> | ServiceId): T {
  const identifier = toIdentifier(id)
  const existing = instances.get(identifier)
  if (existing !== undefined) {
    trackServiceGet(identifier.name)
    return existing as T
  }

  const idName = identifier.name

  // 检查循环依赖
  if (resolutionStack.includes(idName)) {
    const cycle = [...resolutionStack, idName]
    throw new Error(
      `[Services] Circular dependency detected: ${cycle.join(' -> ')}\n` +
        'Consider refactoring services to avoid circular dependencies.'
    )
  }

  const factory = factories.get(identifier)
  if (!factory) {
    throw new Error(`[Services] Service "${idName}" is not registered`)
  }

  resolutionStack.push(idName)

  try {
    trackServiceInit(idName)

    const instance = factory()
    instances.set(identifier, instance)

    completeServiceInit(idName)
    trackServiceGet(idName)

    return instance as T
  } finally {
    resolutionStack.pop()
  }
}

export async function activateService<T>(id: ServiceIdentifier<T> | ServiceId): Promise<T> {
  const identifier = toIdentifier(id)
  const instance = getService<T>(identifier)

  if (isActivatedInstance(identifier, instance)) {
    return instance
  }

  const pending = getActivationOperation(identifier, instance)
  if (pending) {
    await pending.promise
    return instance
  }

  const activation = runLifecycleHook(identifier.name, instance, 'onActivate')
    .then(() => {
      if (instances.get(identifier) === instance) {
        activatedInstances.set(identifier, instance)
      }
    })
    .finally(() => {
      if (getActivationOperation(identifier, instance)) {
        activationOperations.delete(identifier)
      }
    })

  activationOperations.set(identifier, { instance, promise: activation })
  await activation

  return instance
}

export async function deactivateService<T>(id: ServiceIdentifier<T> | ServiceId): Promise<void> {
  const identifier = toIdentifier(id)
  const instance = instances.get(identifier)

  if (instance === undefined) {
    return
  }

  await startInstanceDeactivation(identifier, instance)
}

export async function activateRegisteredServices(
  ids?: Array<ServiceIdentifier<unknown> | ServiceId>
): Promise<void> {
  const identifiers =
    ids?.map(id => toIdentifier(id)) ?? Array.from(factories.keys(), id => toIdentifier(id))

  await Promise.all(identifiers.map(identifier => activateService(identifier)))
}

export async function deactivateRegisteredServices(
  ids?: Array<ServiceIdentifier<unknown> | ServiceId>
): Promise<void> {
  const identifiers =
    ids?.map(id => toIdentifier(id)) ?? Array.from(instances.keys(), id => toIdentifier(id))

  await Promise.all(identifiers.map(identifier => deactivateService(identifier)))
}

export function resetServices(): void {
  for (const [identifier, instance] of instances.entries()) {
    teardownServiceInstance(identifier, instance)
  }

  instances.clear()
  resolutionStack.length = 0 // 清理解析栈
  resetMetrics()
}

export async function resetServicesAsync(): Promise<void> {
  await deactivateRegisteredServices()
  resetServices()
}

export function isRegistered(id: ServiceIdentifier<unknown> | ServiceId): boolean {
  const identifier = toIdentifier(id)
  return factories.has(identifier)
}

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

export function getRegisteredServices(): string[] {
  return Array.from(factories.keys()).map(id => id.name)
}
