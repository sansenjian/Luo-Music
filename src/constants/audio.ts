/**
 * 音频质量常量定义
 *
 * 统一管理音频比特率、音质等级等相关常量
 */

/**
 * 音质等级枚举
 */
export enum AudioQuality {
  /** 标准音质 */
  Standard = 'standard',
  /** 较高音质 */
  Higher = 'higher',
  /** 极高音质 */
  ExHigh = 'exhigh',
  /** 无损音质 */
  Lossless = 'lossless',
  /** 高解析度音质 */
  HiRes = 'hires'
}

/**
 * 音质等级对应的比特率 (bps)
 *
 * 参考标准：
 * - standard: 128kbps - 标准网络流媒体质量
 * - higher: 192kbps - 较高品质
 * - exhigh: 320kbps - MP3 最高品质
 * - lossless: 约 900-1000kbps - FLAC 无损压缩
 * - hires: 约 900-1000kbps - 高解析度音频
 */
export const AUDIO_BITRATE_MAP: Record<AudioQuality, number> = {
  [AudioQuality.Standard]: 128000,
  [AudioQuality.Higher]: 192000,
  [AudioQuality.ExHigh]: 320000,
  [AudioQuality.Lossless]: 999000,
  [AudioQuality.HiRes]: 999000
} as const

/**
 * 默认比特率 (standard)
 */
export const DEFAULT_AUDIO_BITRATE = 128000

/**
 * 根据音质等级获取比特率
 * @param level - 音质等级
 * @param fallback - 默认值，默认为 standard
 * @returns 比特率值 (bps)
 */
export function getBitrateByLevel(level: string | undefined, fallback: number = DEFAULT_AUDIO_BITRATE): number {
  if (!level) return fallback
  return AUDIO_BITRATE_MAP[level as AudioQuality] ?? fallback
}
