/**
 * Image Pool Manager
 *
 * 一个用于管理图片加载任务的工具类，主要用于：
 * 1. 限制并发加载数量，防止阻塞网络。
 * 2. 提供简单的内存缓存，复用已加载的 HTMLImageElement 对象。
 * 3. 支持优先级队列。
 */

interface ImageLoadTask {
  id: string
  url: string
  resolve: (value: HTMLImageElement) => void
  reject: (reason?: unknown) => void
  priority?: number // 优先级，数字越大优先级越高
}

export class ImagePool {
  private static instance: ImagePool

  // 配置
  private maxConcurrency: number = 6 // 浏览器的并发限制通常为 6
  private maxCacheSize: number = 100 // 最大缓存图片数量

  // 状态
  private activeCount: number = 0
  private queue: ImageLoadTask[] = []
  private cache: Map<string, HTMLImageElement> = new Map()
  private pending: Map<string, Promise<HTMLImageElement>> = new Map()

  private constructor() {}

  public static getInstance(): ImagePool {
    if (!ImagePool.instance) {
      ImagePool.instance = new ImagePool()
    }
    return ImagePool.instance
  }

  /**
   * 加载图片
   * @param url 图片 URL
   * @param id 可选，唯一标识符，默认为 url
   * @param priority 可选，优先级，默认为 0
   */
  public load(url: string, id?: string, priority: number = 0): Promise<HTMLImageElement> {
    const key = id || url

    // 1. 检查缓存
    if (this.cache.has(key)) {
      // 刷新缓存位置（LRU）
      const img = this.cache.get(key)!
      this.cache.delete(key)
      this.cache.set(key, img)
      return Promise.resolve(img)
    }

    // 2. 检查是否已有正在进行的相同任务
    if (this.pending.has(key)) {
      return this.pending.get(key)!
    }

    // 3. 创建加载任务
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const task: ImageLoadTask = {
        id: key,
        url,
        resolve,
        reject,
        priority
      }

      // 按优先级插入队列
      this.queue.push(task)
      // 简单的排序，保持高优先级在前
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0))

      this.processQueue()
    })

    // 记录进行中的任务，完成后清除
    this.pending.set(key, promise)
    promise.finally(() => {
      this.pending.delete(key)
    })

    return promise
  }

  /**
   * 处理加载队列
   */
  private async processQueue() {
    // 如果达到最大并发数或队列为空，停止处理
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return
    }

    this.activeCount++
    const task = this.queue.shift()

    if (!task) {
      this.activeCount--
      return
    }

    try {
      const image = await this.loadImage(task.url)

      // 缓存管理：LRU 策略
      if (this.cache.size >= this.maxCacheSize) {
        // Map 的 keys() 返回按插入顺序排列的迭代器，第一个即为最早插入的
        const firstKey = this.cache.keys().next().value
        if (firstKey) this.cache.delete(firstKey)
      }
      this.cache.set(task.id, image)

      task.resolve(image)
    } catch (error) {
      task.reject(error)
    } finally {
      this.activeCount--
      // 继续处理下一个任务
      this.processQueue()
    }
  }

  /**
   * 实际加载图片的逻辑
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`))

      // 设置 crossOrigin 属性，避免跨域 Canvas 污染
      img.crossOrigin = 'anonymous'
      img.src = url
    })
  }

  /**
   * 获取缓存中的图片
   */
  public get(id: string): HTMLImageElement | undefined {
    return this.cache.get(id)
  }

  /**
   * 清除特定缓存
   */
  public remove(id: string) {
    this.cache.delete(id)
  }

  /**
   * 清空所有缓存
   */
  public clear() {
    this.cache.clear()
    // 注意：这里不清空 queue，因为可能还有正在等待的任务
  }

  /**
   * 设置最大并发数
   */
  public setMaxConcurrency(max: number) {
    this.maxConcurrency = max
  }
}

export const imagePool = ImagePool.getInstance()
