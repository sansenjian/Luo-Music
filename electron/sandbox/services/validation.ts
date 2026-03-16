/**
 * 参数验证工具
 *
 * 功能：
 * 1. 验证 IPC 参数类型
 * 2. 验证通道名称合法性
 * 3. 防止 XSS 攻击
 */

/**
 * 验证字符串是否为空
 */
export function isNotEmpty(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (typeof value === 'number') {
    return !Number.isNaN(value)
  }
  return value !== null && value !== undefined
}

/**
 * 验证字符串长度
 */
export function validateStringLength(
  value: string,
  min: number,
  max: number,
  fieldName = 'Field'
): void {
  if (value.length < min || value.length > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max} characters`)
  }
}

/**
 * 验证数字范围
 */
export function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName = 'Field'
): void {
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`)
  }
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 验证音乐平台
 */
export function isValidPlatform(platform: string): platform is 'netease' | 'qq' {
  return platform === 'netease' || platform === 'qq'
}

/**
 * 验证搜索类型
 */
export function isValidSearchType(type: string): type is 'song' | 'artist' | 'album' | 'playlist' | 'user' {
  return ['song', 'artist', 'album', 'playlist', 'user'].includes(type)
}

/**
 * 验证播放模式
 */
export function isValidPlayMode(mode: string): mode is 'list' | 'loop' | 'random' | 'single' {
  return ['list', 'loop', 'random', 'single'].includes(mode)
}

/**
 * 验证日志级别
 */
export function isValidLogLevel(level: string): level is 'debug' | 'info' | 'warn' | 'error' {
  return ['debug', 'info', 'warn', 'error'].includes(level)
}

/**
 * 清理字符串防止 XSS
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * 清理对象中的所有字符串
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized as T
}

/**
 * 验证器类 - 链式验证
 *
 * @example
 * ```typescript
 * Validator.string(keyword, 'keyword').min(1).max(100).validate()
 * Validator.number(volume, 'volume').min(0).max(100).validate()
 * ```
 */
export class Validator {
  private errors: string[] = []

  /**
   * 字符串验证
   */
  static string(value: unknown, fieldName = 'Field'): StringValidator {
    return new StringValidator(value, fieldName)
  }

  /**
   * 数字验证
   */
  static number(value: unknown, fieldName = 'Field'): NumberValidator {
    return new NumberValidator(value, fieldName)
  }

  /**
   * 布尔验证
   */
  static boolean(value: unknown, fieldName = 'Field'): boolean {
    if (typeof value !== 'boolean') {
      throw new Error(`${fieldName} must be a boolean`)
    }
    return value
  }

  /**
   * 枚举验证
   */
  static enum<T extends string>(value: unknown, allowedValues: T[], fieldName = 'Field'): T {
    if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
      throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`)
    }
    return value as T
  }

  /**
   * 验证并抛出错误
   */
  static validate(errors: string[]): void {
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`)
    }
  }
}

/**
 * 字符串验证器
 */
export class StringValidator {
  private value: string
  private fieldName: string

  constructor(value: unknown, fieldName: string) {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`)
    }
    this.value = value
    this.fieldName = fieldName
  }

  min(length: number): this {
    if (this.value.length < length) {
      throw new Error(`${this.fieldName} must be at least ${length} characters`)
    }
    return this
  }

  max(length: number): this {
    if (this.value.length > length) {
      throw new Error(`${this.fieldName} must be at most ${length} characters`)
    }
    return this
  }

  notEmpty(): this {
    if (!this.value.trim()) {
      throw new Error(`${this.fieldName} cannot be empty`)
    }
    return this
  }

  pattern(regex: RegExp, message?: string): this {
    if (!regex.test(this.value)) {
      throw new Error(message || `${this.fieldName} format is invalid`)
    }
    return this
  }

  validate(): string {
    return this.value
  }
}

/**
 * 数字验证器
 */
export class NumberValidator {
  private value: number
  private fieldName: string

  constructor(value: unknown, fieldName: string) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`${fieldName} must be a number`)
    }
    this.value = value
    this.fieldName = fieldName
  }

  min(min: number): this {
    if (this.value < min) {
      throw new Error(`${this.fieldName} must be at least ${min}`)
    }
    return this
  }

  max(max: number): this {
    if (this.value > max) {
      throw new Error(`${this.fieldName} must be at most ${max}`)
    }
    return this
  }

  integer(): this {
    if (!Number.isInteger(this.value)) {
      throw new Error(`${this.fieldName} must be an integer`)
    }
    return this
  }

  positive(): this {
    if (this.value <= 0) {
      throw new Error(`${this.fieldName} must be positive`)
    }
    return this
  }

  validate(): number {
    return this.value
  }
}
