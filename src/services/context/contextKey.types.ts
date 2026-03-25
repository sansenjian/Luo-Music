import type { Event } from '../../base/common/event/event'

export type ContextKeyValue = boolean | number | string | null | undefined

export interface ContextKey<T extends ContextKeyValue = ContextKeyValue> {
  set(value: T): void
  reset(): void
  get(): T | undefined
}

export interface ContextKeyService {
  readonly onDidChangeContext: Event<{ key: string; value: ContextKeyValue }>

  createKey<T extends ContextKeyValue>(key: string, defaultValue?: T): ContextKey<T>
  setContext(key: string, value: ContextKeyValue): void
  getContext<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined
  removeContext(key: string): void
  contextMatchesRules(expression?: string): boolean
  getAll(): Record<string, ContextKeyValue>
}
