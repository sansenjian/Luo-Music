import type { Event } from '../../base/common/event/event'
import { EventEmitter } from '../../base/common/event/event'
import { evaluateContextExpression, parseContextExpression, type ContextExpressionAst } from './contextExpression'
import type { ContextKey, ContextKeyService, ContextKeyValue } from './contextKey.types'

class BoundContextKey<T extends ContextKeyValue> implements ContextKey<T> {
  constructor(
    private readonly service: ContextKeyServiceImpl,
    private readonly key: string,
    private readonly defaultValue?: T
  ) {}

  set(value: T): void {
    this.service.setContext(this.key, value)
  }

  reset(): void {
    if (this.defaultValue === undefined) {
      this.service.removeContext(this.key)
      return
    }

    this.service.setContext(this.key, this.defaultValue)
  }

  get(): T | undefined {
    const value = this.service.getContext<T>(this.key)
    return value === undefined ? this.defaultValue : value
  }
}

class ContextKeyServiceImpl implements ContextKeyService {
  private readonly values = new Map<string, ContextKeyValue>()
  private readonly expressionCache = new Map<string, ContextExpressionAst>()
  private readonly onDidChangeContextEmitter = new EventEmitter<{
    key: string
    value: ContextKeyValue
  }>()

  readonly onDidChangeContext: Event<{ key: string; value: ContextKeyValue }> =
    this.onDidChangeContextEmitter.event

  createKey<T extends ContextKeyValue>(key: string, defaultValue?: T): ContextKey<T> {
    if (defaultValue !== undefined && !this.values.has(key)) {
      this.values.set(key, defaultValue)
    }

    return new BoundContextKey<T>(this, key, defaultValue)
  }

  setContext(key: string, value: ContextKeyValue): void {
    if (this.values.get(key) === value) {
      return
    }

    this.values.set(key, value)
    this.onDidChangeContextEmitter.fire({ key, value })
  }

  getContext<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined {
    return this.values.get(key) as T | undefined
  }

  removeContext(key: string): void {
    if (!this.values.has(key)) {
      return
    }

    this.values.delete(key)
    this.onDidChangeContextEmitter.fire({ key, value: undefined })
  }

  contextMatchesRules(expression?: string): boolean {
    if (!expression || expression.trim() === '') {
      return true
    }

    try {
      const ast = this.getOrParseExpression(expression)
      return Boolean(evaluateContextExpression(ast, key => this.values.get(key)))
    } catch {
      return false
    }
  }

  getAll(): Record<string, ContextKeyValue> {
    return Object.fromEntries(this.values.entries())
  }

  dispose(): void {
    this.values.clear()
    this.expressionCache.clear()
    this.onDidChangeContextEmitter.dispose()
  }

  private getOrParseExpression(expression: string): ContextExpressionAst {
    const cached = this.expressionCache.get(expression)
    if (cached) {
      return cached
    }

    const ast = parseContextExpression(expression)
    this.expressionCache.set(expression, ast)
    return ast
  }
}

export function createContextKeyService(): ContextKeyService {
  return new ContextKeyServiceImpl()
}
