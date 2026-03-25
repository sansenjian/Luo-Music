/**
 * 基础类型定义
 * 提供项目中常用的类型工具
 */

/**
 * 可能为 null 的类型
 */
export type Nullable<T> = T | null

/**
 * 可能为 undefined 的类型
 */
export type Optional<T> = T | undefined

/**
 * 可能为 null 或 undefined 的类型
 */
export type MaybeUndefined<T> = T | null | undefined

/**
 * 非空类型（排除 null 和 undefined）
 */
export type NonNullable<T> = T extends null | undefined ? never : T

/**
 * 获取函数参数类型
 */
export type Parameters<T> = T extends (...args: infer P) => unknown ? P : never

/**
 * 获取函数返回类型
 */
export type ReturnType<T> = T extends (...args: unknown[]) => infer R ? R : never

/**
 * 获取 Promise 解析后的类型
 */
export type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T

/**
 * 将对象类型变为只读
 */
export type Readonly<T> = {
  readonly [P in keyof T]: T[P]
}

/**
 * 将对象类型变为可写
 */
export type Writable<T> = {
  -readonly [P in keyof T]: T[P]
}

/**
 * 深度只读
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * 获取对象键的类型
 */
export type ObjectKeys<T extends object> = keyof T

/**
 * 获取对象值的类型
 */
export type ObjectValues<T extends object> = T[keyof T]

/**
 * 获取对象条目的类型
 */
export type ObjectEntries<T extends object> = [keyof T, T[keyof T]][]

/**
 * 将对象键值对转换为联合类型
 */
export type KeyValue<T, K extends keyof T> = { key: K; value: T[K] }

/**
 * 必须包含指定键
 */
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * 部分可选
 */
export type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * 事件回调类型
 */
export type EventCallback<T = unknown> = (data: T) => void

/**
 * 异步函数类型
 */
export type AsyncFunction<T = void, Args extends unknown[] = []> = (...args: Args) => Promise<T>

/**
 * 比较两个类型是否相等
 */
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

/**
 * 品牌类型（用于创建名义类型）
 */
export type Brand<T, B> = T & { __brand: B }

/**
 * 创建品牌类型的辅助函数
 */
export function createBrand<T, B>(value: T): Brand<T, B> {
  return value as Brand<T, B>
}

/**
 * 任意对象类型
 */
export type AnyRecord = Record<string, unknown>

/**
 * 构造函数类型
 */
export type Constructor<T = unknown> = new (...args: unknown[]) => T

/**
 * 抽象构造函数类型
 */
export type AbstractConstructor<T = unknown> = abstract new (...args: unknown[]) => T

/**
 * 混合类型
 */
export type Mixin<T extends Constructor, U extends Constructor> = T & U

/**
 * 类型守卫：检查值是否为 null
 */
export function isNull(value: unknown): value is null {
  return value === null
}

/**
 * 类型守卫：检查值是否为 undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined
}

/**
 * 类型守卫：检查值是否为 null 或 undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return isNull(value) || isUndefined(value)
}

/**
 * 类型守卫：检查值是否为非空
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return !isNullOrUndefined(value)
}

/**
 * 类型守卫：检查值是否为对象
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 类型守卫：检查值是否为函数
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

/**
 * 类型守卫：检查值是否为字符串
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * 类型守卫：检查值是否为数字
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * 类型守卫：检查值是否为布尔值
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * 类型守卫：检查值是否为数组
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value)
}

/**
 * 类型守卫：检查值是否为 Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * 类型守卫：检查值是否为 Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    value instanceof Promise ||
    (isObject(value) && 'then' in value && isFunction((value as { then: unknown }).then))
  )
}
