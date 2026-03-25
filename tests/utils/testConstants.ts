/**
 * 测试常量 - 统一管理测试中的魔法数字和固定值
 *
 * 用途：
 * 1. 避免测试代码中的硬编码魔法数字
 * 2. 统一修改测试基准时间/数据
 * 3. 提高测试代码可读性
 */

/**
 * 测试基准时间戳 (2026-03-17T00:00:00.000Z)
 * 用于 vi.setSystemTime() 等时间相关测试
 */
export const TEST_BASE_TIMESTAMP = new Date('2026-03-17T00:00:00.000Z').getTime()

/**
 * 测试基准日期对象
 * 默认测试系统时间
 */
export const TEST_BASE_DATE = new Date('2026-03-17T00:00:00.000Z')

/**
 * 时间偏移量常量（毫秒）
 */
export const TIME_OFFSETS = {
  /** 50ms - 最小延迟 */
  MS_50: 50,
  /** 100ms - 快速操作间隔 */
  MS_100: 100,
  /** 150ms - 较短延迟 */
  MS_150: 150,
  /** 200ms - 短暂延迟 */
  MS_200: 200,
  /** 300ms - 中等延迟 */
  MS_300: 300,
  /** 400ms - 较长延迟 */
  MS_400: 400,
  /** 500ms - 半秒 */
  MS_500: 500,
  /** 900ms - 接近 1 秒 */
  MS_900: 900,
  /** 1000ms - 1 秒 */
  SEC_1: 1000
} as const

/**
 * 测试用歌曲数据
 */
export const TEST_SONG = {
  id: 'song-1',
  name: 'Song 1',
  artists: [{ id: 'artist-1', name: 'Artist 1' }],
  album: { id: 'album-1', name: 'Album 1', picUrl: '' },
  duration: 180000,
  mvid: 0,
  platform: 'netease',
  originalId: 'song-1'
} as const

/**
 * 测试用端口配置
 */
export const TEST_PORTS = {
  /** QQ 音乐服务默认端口 */
  QQ: 3200,
  /** 网易云音乐服务默认端口 */
  NETEASE: 14532
} as const

/**
 * 测试用 ID 生成器
 * 用于生成唯一的测试 ID
 */
export function createTestId(prefix: string, index: number): string {
  return `${prefix}-${index}`
}

/**
 * 获取相对基准时间的日期对象
 * @param offsetMs 相对于基准时间的偏移量（毫秒）
 */
export function getTestDate(offsetMs: number = 0): Date {
  return new Date(TEST_BASE_TIMESTAMP + offsetMs)
}
