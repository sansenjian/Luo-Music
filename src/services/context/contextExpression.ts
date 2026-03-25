import type { ContextKeyValue } from './contextKey.types'

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

export type ContextExpressionAst =
  | { type: 'literal'; value: ContextKeyValue }
  | { type: 'key'; key: string }
  | { type: 'not'; operand: ContextExpressionAst }
  | {
      type: 'binary'
      operator: '&&' | '||' | '==' | '!='
      left: ContextExpressionAst
      right: ContextExpressionAst
    }

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

  parse(): ContextExpressionAst {
    const node = this.parseOr()
    this.expect('eof')
    return node
  }

  private parseOr(): ContextExpressionAst {
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

  private parseAnd(): ContextExpressionAst {
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

  private parseEquality(): ContextExpressionAst {
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

  private parseUnary(): ContextExpressionAst {
    if (this.match('not')) {
      return {
        type: 'not',
        operand: this.parseUnary()
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): ContextExpressionAst {
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

export function parseContextExpression(expression: string): ContextExpressionAst {
  return new ContextExpressionParser(tokenize(expression)).parse()
}

export function evaluateContextExpression(
  node: ContextExpressionAst,
  getValue: (key: string) => ContextKeyValue
): ContextKeyValue | boolean {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'key':
      return getValue(node.key)
    case 'not':
      return !evaluateContextExpression(node.operand, getValue)
    case 'binary': {
      if (node.operator === '&&') {
        return (
          Boolean(evaluateContextExpression(node.left, getValue)) &&
          Boolean(evaluateContextExpression(node.right, getValue))
        )
      }

      if (node.operator === '||') {
        return (
          Boolean(evaluateContextExpression(node.left, getValue)) ||
          Boolean(evaluateContextExpression(node.right, getValue))
        )
      }

      const left = evaluateContextExpression(node.left, getValue)
      const right = evaluateContextExpression(node.right, getValue)
      return node.operator === '==' ? left === right : left !== right
    }
  }
}
