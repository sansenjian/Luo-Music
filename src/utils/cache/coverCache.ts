import { LRUCache } from 'lru-cache'

// 创建一个 LRU 缓存实例
// max: 最大缓存数量 (例如 50 张图片)
// ttl: 缓存过期时间 (例如 1 小时)
// sizeCalculation: 计算每个条目的大小 (这里简化为 1，即只计数)
// dispose: 当条目被移除时的回调 (可以用于释放 Blob URL)
const coverCache = new LRUCache<string, string>({
  max: 50,
  ttl: 1000 * 60 * 60, // 1 hour
  dispose: (value, _key) => {
    // 如果存储的是 Blob URL，需要手动释放
    if (value.startsWith('blob:')) {
      URL.revokeObjectURL(value)
    }
  }
})

export class CoverCacheManager {
  /**
   * 将缩略图值标准化为可直接用于 MediaMetadata.artwork 的 URL。
   * 已有的 data/blob/http/file URL 原样返回，裸 base64 会补全 data URL 前缀。
   */
  static toArtworkUrl(value: string, mimeType = 'image/jpeg'): string {
    if (
      value.startsWith('data:') ||
      value.startsWith('blob:') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('file://')
    ) {
      return value
    }

    return `data:${mimeType};base64,${value}`
  }

  /**
   * 获取缓存的封面 URL
   * @param id 歌曲 ID 或唯一标识
   */
  static get(id: string): string | undefined {
    return coverCache.get(id)
  }

  /**
   * 设置封面缓存
   * @param id 歌曲 ID
   * @param url 图片 URL
   */
  static set(id: string, url: string) {
    // 如果已存在且是 Blob URL，先不处理，让 LRU 自动处理旧值
    // 但如果直接覆盖，LRU 会调用 dispose 释放旧值吗？是的，lru-cache 会处理。
    coverCache.set(id, url)
  }

  /**
   * 拉取本地封面并统一缓存为 data URL，供 Media Session / UI 复用。
   */
  static async fetchThumbnailAsDataUrl(
    id: string,
    fetcher: (id: string) => Promise<string | null>,
    mimeType = 'image/jpeg'
  ): Promise<string> {
    const cached = this.get(id)
    if (cached) {
      return cached
    }

    const nextValue = await fetcher(id)
    if (!nextValue) {
      return ''
    }

    const dataUrl = this.toArtworkUrl(nextValue, mimeType)
    this.set(id, dataUrl)
    return dataUrl
  }

  /**
   * 预加载图片并缓存
   * @param id 歌曲 ID
   * @param url 图片原始 URL
   */
  static async preload(id: string, url: string): Promise<string> {
    const cached = this.get(id)
    if (cached) return cached

    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      this.set(id, objectUrl)
      return objectUrl
    } catch (error) {
      console.error('Failed to preload cover:', error)
      return url // 失败时返回原 URL
    }
  }

  static clear() {
    coverCache.clear()
  }
}
