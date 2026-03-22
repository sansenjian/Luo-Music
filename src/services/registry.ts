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

const factories = new Map<ServiceIdentifier<unknown>, ServiceFactory<unknown>>()
const instances = new Map<ServiceIdentifier<unknown>, unknown>()
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
}

export function getService<T>(id: ServiceIdentifier<T> | ServiceId): T {
  const identifier = toIdentifier(id)
  const existing = instances.get(identifier)
  if (existing !== undefined) {
    trackServiceGet(identifier.name)
    return existing as T
  }

  const idName = identifier.name

  if (creatingStack.includes(idName)) {
    const cycle = [...creatingStack, idName]
    creatingStack.length = 0
    throw new Error(
      `[Services] Circular dependency detected: ${cycle.join(' -> ')}\n` +
        'Consider refactoring services to avoid circular dependencies.'
    )
  }

  const factory = factories.get(identifier)
  if (!factory) {
    throw new Error(`[Services] Service "${idName}" is not registered`)
  }

  creatingStack.push(idName)

  try {
    trackServiceInit(idName)

    const instance = factory()
    instances.set(identifier, instance)

    completeServiceInit(idName)
    trackServiceGet(idName)

    return instance as T
  } finally {
    creatingStack.pop()
  }
}

export function resetServices(): void {
  for (const [identifier, instance] of instances.entries()) {
    disposeServiceInstance(identifier.name, instance)
  }

  instances.clear()
  creatingStack.length = 0
  resetMetrics()
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
