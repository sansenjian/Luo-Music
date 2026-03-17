import type { Event } from '../base/common/event/event'
import { EventEmitter } from '../base/common/event/event'

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

type TokenType =
  | 'identifier'
  | 'boolean'
  | 'number'
  | 'string'
  | 'and'
  | 'or'
  | 'not'
  | 'eq'
  | 'neq'
  | 'lparen'
  | 'rparen'
  | 'eof'

type Token = {
  type: TokenType
  value?: string | number | boolean
}

type AstNode =
  | { type: 'literal'; value: ContextKeyValue }
  | { type: 'key'; key: string }
  | { type: 'not'; operand: AstNode }
  | { type: 'binary'; operator: '&&' | '||' | '==' | '!='; left: AstNode; right: AstNode }

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_.$-]/.test(char)
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '&' && expression[index + 1] === '&') {
      tokens.push({ type: 'and' })
      index += 2
      continue
    }

    if (char === '|' && expression[index + 1] === '|') {
      tokens.push({ type: 'or' })
      index += 2
      continue
    }

    if (char === '=' && expression[index + 1] === '=') {
      tokens.push({ type: 'eq' })
      index += 2
      continue
    }

    if (char === '!' && expression[index + 1] === '=') {
      tokens.push({ type: 'neq' })
      index += 2
      continue
    }

    if (char === '!') {
      tokens.push({ type: 'not' })
      index += 1
      continue
    }

    if (char === '(') {
      tokens.push({ type: 'lparen' })
      index += 1
      continue
    }

    if (char === ')') {
      tokens.push({ type: 'rparen' })
      index += 1
      continue
    }

    if (char === '"' || char === "'") {
      const quote = char
      let value = ''
      index += 1

      while (index < expression.length && expression[index] !== quote) {
        value += expression[index]
        index += 1
      }

      if (expression[index] !== quote) {
        throw new Error(`Unterminated string in expression: ${expression}`)
      }

      index += 1
      tokens.push({ type: 'string', value })
      continue
    }

    if (isDigit(char)) {
      let value = char
      index += 1

      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        value += expression[index]
        index += 1
      }

      tokens.push({ type: 'number', value: Number(value) })
      continue
    }

    if (isIdentifierStart(char)) {
      let value = char
      index += 1

      while (index < expression.length && isIdentifierPart(expression[index])) {
        value += expression[index]
        index += 1
      }

      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value: value === 'true' })
      } else {
        tokens.push({ type: 'identifier', value })
      }
      continue
    }

    throw new Error(`Unexpected token "${char}" in expression: ${expression}`)
  }

  tokens.push({ type: 'eof' })
  return tokens
}

class ContextExpressionParser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    const node = this.parseOr()
    this.expect('eof')
    return node
  }

  private parseOr(): AstNode {
    let node = this.parseAnd()

    while (this.match('or')) {
      node = {
        type: 'binary',
        operator: '||',
        left: node,
        right: this.parseAnd()
      }
    }

    return node
  }

  private parseAnd(): AstNode {
    let node = this.parseEquality()

    while (this.match('and')) {
      node = {
        type: 'binary',
        operator: '&&',
        left: node,
        right: this.parseEquality()
      }
    }

    return node
  }

  private parseEquality(): AstNode {
    let node = this.parseUnary()

    while (true) {
      if (this.match('eq')) {
        node = {
          type: 'binary',
          operator: '==',
          left: node,
          right: this.parseUnary()
        }
        continue
      }

      if (this.match('neq')) {
        node = {
          type: 'binary',
          operator: '!=',
          left: node,
          right: this.parseUnary()
        }
        continue
      }

      return node
    }
  }

  private parseUnary(): AstNode {
    if (this.match('not')) {
      return {
        type: 'not',
        operand: this.parseUnary()
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): AstNode {
    const token = this.peek()

    if (token.type === 'identifier') {
      this.index += 1
      return { type: 'key', key: String(token.value) }
    }

    if (token.type === 'boolean' || token.type === 'number' || token.type === 'string') {
      this.index += 1
      return { type: 'literal', value: token.value as ContextKeyValue }
    }

    if (this.match('lparen')) {
      const expression = this.parseOr()
      this.expect('rparen')
      return expression
    }

    throw new Error(`Unexpected token "${token.type}" in context expression`)
  }

  private match(type: TokenType): boolean {
    if (this.peek().type !== type) {
      return false
    }

    this.index += 1
    return true
  }

  private expect(type: TokenType): void {
    if (!this.match(type)) {
      throw new Error(`Expected token "${type}" but got "${this.peek().type}"`)
    }
  }

  private peek(): Token {
    return this.tokens[this.index]
  }
}

function evaluateExpression(
  node: AstNode,
  getValue: (key: string) => ContextKeyValue
): ContextKeyValue | boolean {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'key':
      return getValue(node.key)
    case 'not':
      return !evaluateExpression(node.operand, getValue)
    case 'binary': {
      if (node.operator === '&&') {
        return (
          Boolean(evaluateExpression(node.left, getValue)) &&
          Boolean(evaluateExpression(node.right, getValue))
        )
      }

      if (node.operator === '||') {
        return (
          Boolean(evaluateExpression(node.left, getValue)) ||
          Boolean(evaluateExpression(node.right, getValue))
        )
      }

      const left = evaluateExpression(node.left, getValue)
      const right = evaluateExpression(node.right, getValue)
      return node.operator === '==' ? left === right : left !== right
    }
  }
}

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
  private readonly expressionCache = new Map<string, AstNode>()
  private readonly onDidChangeContextEmitter = new EventEmitter<{
    key: string
    value: ContextKeyValue
  }>()

  readonly onDidChangeContext = this.onDidChangeContextEmitter.event

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
      return Boolean(evaluateExpression(ast, key => this.values.get(key)))
    } catch {
      return false
    }
  }

  getAll(): Record<string, ContextKeyValue> {
    return Object.fromEntries(this.values.entries())
  }

  private getOrParseExpression(expression: string): AstNode {
    const cached = this.expressionCache.get(expression)
    if (cached) {
      return cached
    }

    const ast = new ContextExpressionParser(tokenize(expression)).parse()
    this.expressionCache.set(expression, ast)
    return ast
  }
}

export function createContextKeyService(): ContextKeyService {
  return new ContextKeyServiceImpl()
}
