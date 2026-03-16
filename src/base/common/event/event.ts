/**
 * 事件系统 - 借鉴 VSCode 的事件模式
 * 提供类型安全的事件订阅和发布机制
 */

import type { IDisposable } from '../lifecycle/disposable'

/**
 * 事件类型定义
 * 用于描述一个可以被订阅的事件
 */
export interface Event<T> {
  /**
   * 订阅事件
   * @param listener 事件监听器
   * @returns 取消订阅的函数
   */
  (listener: (e: T) => unknown): IDisposable
}

/**
 * 事件发射器
 * 用于创建和管理事件的发布订阅
 */
export class EventEmitter<T> {
  private _listeners: ((e: T) => unknown)[] = []
  private _disposed = false

  /**
   * 获取事件对象
   * 可以用于订阅事件
   */
  get event(): Event<T> {
    return (listener: (e: T) => unknown): IDisposable => {
      if (this._disposed) {
        return { dispose: () => {} }
      }

      this._listeners.push(listener)

      return {
        dispose: () => {
          this._removeListener(listener)
        }
      }
    }
  }

  /**
   * 发射事件
   * @param data 事件数据
   */
  fire(data: T): void {
    if (this._disposed) {
      return
    }

    // 复制监听器数组，防止在回调中修改数组
    const listeners = this._listeners.slice()
    for (const listener of listeners) {
      listener(data)
    }
  }

  /**
   * 移除监听器
   */
  private _removeListener(listener: (e: T) => unknown): void {
    const index = this._listeners.indexOf(listener)
    if (index >= 0) {
      this._listeners.splice(index, 1)
    }
  }

  /**
   * 销毁发射器，释放所有监听器
   */
  dispose(): void {
    if (!this._disposed) {
      this._listeners = []
      this._disposed = true
    }
  }

  /**
   * 检查是否已被销毁
   */
  get disposed(): boolean {
    return this._disposed
  }

  /**
   * 获取当前监听器数量
   */
  get listenerCount(): number {
    return this._listeners.length
  }
}

/**
 * 创建一个空的事件（永不触发）
 */
export function createEmptyEvent<T>(): Event<T> {
  return () => ({ dispose: () => {} })
}

/**
 * 合并多个事件为一个
 * 当任一事件触发时，合并后的事件也会触发
 */
export function anyEvent<T>(...events: Event<T>[]): Event<T> {
  return (listener: (e: T) => unknown): IDisposable => {
    const disposables: IDisposable[] = []

    for (const event of events) {
      disposables.push(event(listener))
    }

    return {
      dispose: () => {
        for (const d of disposables) {
          d.dispose()
        }
      }
    }
  }
}

/**
 * 创建一个只触发一次的事件包装
 */
export function onceEvent<T>(event: Event<T>): Event<T> {
  return (listener: (e: T) => unknown): IDisposable => {
    let disposed = false
    const disposable = event((e: T) => {
      if (!disposed) {
        disposed = true
        disposable.dispose()
        listener(e)
      }
    })

    return {
      dispose: () => {
        disposed = true
        disposable.dispose()
      }
    }
  }
}

/**
 * 过滤事件
 * 只有当过滤器返回 true 时才触发
 */
export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
  return (listener: (e: T) => unknown): IDisposable => {
    return event((e: T) => {
      if (filter(e)) {
        listener(e)
      }
    })
  }
}

/**
 * 映射事件数据
 */
export function mapEvent<I, O>(event: Event<I>, map: (e: I) => O): Event<O> {
  return (listener: (e: O) => unknown): IDisposable => {
    return event((e: I) => {
      listener(map(e))
    })
  }
}

/**
 * 防抖事件
 * 在事件停止触发一段时间后才触发
 */
export function debounceEvent<T>(event: Event<T>, delay: number): Event<T> {
  return (listener: (e: T) => unknown): IDisposable => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let lastData: T

    const disposable = event((e: T) => {
      lastData = e
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        listener(lastData)
        timeoutId = null
      }, delay)
    })

    return {
      dispose: () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
        disposable.dispose()
      }
    }
  }
}
