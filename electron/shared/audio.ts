/**
 * Shared audio quality constants used by both renderer and Electron processes.
 */

export enum AudioQuality {
  Standard = 'standard',
  Higher = 'higher',
  ExHigh = 'exhigh',
  Lossless = 'lossless',
  HiRes = 'hires'
}

export const AUDIO_BITRATE_MAP: Record<AudioQuality, number> = {
  [AudioQuality.Standard]: 128000,
  [AudioQuality.Higher]: 192000,
  [AudioQuality.ExHigh]: 320000,
  [AudioQuality.Lossless]: 999000,
  [AudioQuality.HiRes]: 999000
} as const

export const DEFAULT_AUDIO_BITRATE = 128000

export function getBitrateByLevel(
  level: string | undefined,
  fallback: number = DEFAULT_AUDIO_BITRATE
): number {
  if (!level) return fallback
  return AUDIO_BITRATE_MAP[level as AudioQuality] ?? fallback
}
