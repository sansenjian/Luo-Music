/**
 * 生命周期管理 - 借鉴 VSCode 的 Disposable 模式
 * 提供统一的资源释放机制，避免内存泄漏
 */

/**
 * 可释放资源接口
 */
export interface IDisposable {
  /**
   * 释放资源
   */
  dispose(): void
}

/**
 * 可释放资源的抽象基类
 * 提供资源注册和统一释放的能力
 */
export class Disposable implements IDisposable {
  private _disposed = false
  private _disposables: IDisposable[] = []

  /**
   * 注册一个可释放资源
   * 当此对象被释放时，所有注册的资源也会被释放
   * @param d 要注册的可释放资源
   * @returns 返回传入的资源
   */
  register<T extends IDisposable>(d: T): T {
    if (this._disposed) {
      // 如果已经被释放，立即释放新注册的资源
      d.dispose()
    } else {
      this._disposables.push(d)
    }
    return d
  }

  /**
   * 释放所有资源
   */
  dispose(): void {
    if (!this._disposed) {
      // 逆序释放，确保后注册的资源先释放
      for (let i = this._disposables.length - 1; i >= 0; i--) {
        this._disposables[i].dispose()
      }
      this._disposables = []
      this._disposed = true
    }
  }

  /**
   * 检查是否已被释放
   */
  get disposed(): boolean {
    return this._disposed
  }

  /**
   * 创建一个 Disposable
   * @param call 释放时要执行的回调函数
   */
  static from(call: () => void): IDisposable {
    return {
      dispose: call
    }
  }

  /**
   * 合并多个 Disposable 为一个
   */
  static combine(...disposables: IDisposable[]): IDisposable {
    return {
      dispose: () => {
        for (const d of disposables) {
          d.dispose()
        }
      }
    }
  }

  /**
   * 创建一个空的 Disposable（不做任何操作）
   */
  static none: IDisposable = { dispose: () => {} }
}

/**
 * 可释放资源的集合
 * 用于管理多个可释放资源
 */
export class DisposableStore implements IDisposable {
  private _disposed = false
  private _toDispose: Set<IDisposable> = new Set()

  /**
   * 添加一个可释放资源
   */
  add<T extends IDisposable>(d: T): T {
    if (this._disposed) {
      d.dispose()
    } else {
      this._toDispose.add(d)
    }
    return d
  }

  /**
   * 移除并释放一个资源
   */
  delete(d: IDisposable): boolean {
    if (this._toDispose.has(d)) {
      this._toDispose.delete(d)
      d.dispose()
      return true
    }
    return false
  }

  /**
   * 释放所有资源
   */
  clear(): void {
    if (this._disposed) {
      return
    }

    // 逆序释放
    const disposables = Array.from(this._toDispose).reverse()
    this._toDispose.clear()

    for (const d of disposables) {
      d.dispose()
    }
  }

  /**
   * 释放所有资源并标记为已销毁
   */
  dispose(): void {
    if (this._disposed) {
      return
    }

    this.clear()
    this._disposed = true
  }

  /**
   * 检查是否已被释放
   */
  get disposed(): boolean {
    return this._disposed
  }

  /**
   * 获取当前管理的资源数量
   */
  get size(): number {
    return this._toDispose.size
  }
}

/**
 * 引用计数的可释放资源
 * 当引用计数降为 0 时自动释放
 */
export class ReferenceDisposable<T extends IDisposable> implements IDisposable {
  private _refCount = 1
  private _value: T

  constructor(value: T) {
    this._value = value
  }

  /**
   * 获取值
   */
  get value(): T {
    return this._value
  }

  /**
   * 增加引用计数
   */
  acquire(): this {
    if (this._refCount <= 0) {
      throw new Error('Cannot acquire a disposed reference')
    }
    this._refCount++
    return this
  }

  /**
   * 减少引用计数，当计数为 0 时释放资源
   */
  dispose(): void {
    if (this._refCount <= 0) {
      return
    }

    this._refCount--
    if (this._refCount === 0) {
      this._value.dispose()
    }
  }

  /**
   * 获取当前引用计数
   */
  get refCount(): number {
    return this._refCount
  }
}

/**
 * 用于跟踪对象是否已被释放的辅助类
 */
export class DisposableTracker {
  private _disposables: Map<string, IDisposable> = new Map()

  /**
   * 跟踪一个可释放资源
   * @param id 唯一标识符
   * @param d 可释放资源
   */
  track(id: string, d: IDisposable): IDisposable {
    if (this._disposables.has(id)) {
      console.warn(`Disposable with id "${id}" already exists, disposing old one`)
      this._disposables.get(id)?.dispose()
    }

    this._disposables.set(id, d)

    return {
      dispose: () => {
        if (this._disposables.get(id) === d) {
          this._disposables.delete(id)
          d.dispose()
        }
      }
    }
  }

  /**
   * 释放指定 ID 的资源
   */
  dispose(id: string): boolean {
    const d = this._disposables.get(id)
    if (d) {
      this._disposables.delete(id)
      d.dispose()
      return true
    }
    return false
  }

  /**
   * 释放所有资源
   */
  disposeAll(): void {
    for (const d of this._disposables.values()) {
      d.dispose()
    }
    this._disposables.clear()
  }

  /**
   * 检查是否存在指定 ID 的资源
   */
  has(id: string): boolean {
    return this._disposables.has(id)
  }

  /**
   * 获取当前跟踪的资源数量
   */
  get size(): number {
    return this._disposables.size
  }
}