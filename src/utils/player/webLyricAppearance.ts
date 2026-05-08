import type { WebLyricAppearance, WebLyricTextAlign } from '@shared/types/player'

export type WebLyricOption<T extends string = string> = {
  label: string
  value: T
}

export const WEB_LYRIC_FONT_OPTIONS: WebLyricOption[] = [
  { label: '跟随界面', value: 'inherit' },
  { label: 'Noto Sans SC', value: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
  { label: 'Microsoft YaHei', value: '"Microsoft YaHei", sans-serif' },
  { label: 'PingFang SC', value: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { label: 'HarmonyOS Sans SC', value: '"HarmonyOS Sans SC", "Microsoft YaHei", sans-serif' }
]

export const WEB_LYRIC_COLOR_OPTIONS: WebLyricOption[] = [
  { label: '琥珀橙', value: '#f97316' },
  { label: '曜石黑', value: '#0f172a' },
  { label: '深海蓝', value: '#2563eb' },
  { label: '青松绿', value: '#0f766e' },
  { label: '玫瑰红', value: '#e11d48' },
  { label: '雾灰', value: '#64748b' },
  { label: '米白', value: '#f8fafc' }
]

export const WEB_LYRIC_TEXT_ALIGN_OPTIONS: Array<WebLyricOption<WebLyricTextAlign>> = [
  { label: '居左', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '居右', value: 'right' }
]

export const DEFAULT_WEB_LYRIC_APPEARANCE: WebLyricAppearance = {
  fontFamily: 'inherit',
  mainFontSize: 18,
  subFontSize: 13,
  textAlign: 'left',
  inactiveOpacity: 0.5,
  activeTextColor: '#ffffff',
  inactiveTextColor: '#0f172a',
  translationColor: '#6b7280',
  romaColor: '#6b7280'
}

const OBSOLETE_WEB_LYRIC_APPEARANCE_V1: WebLyricAppearance = {
  fontFamily: 'inherit',
  mainFontSize: 18,
  subFontSize: 13,
  textAlign: 'left',
  inactiveOpacity: 0.56,
  activeTextColor: '#f97316',
  inactiveTextColor: '#0f172a',
  translationColor: '#475569',
  romaColor: '#64748b'
}

const VALID_TEXT_ALIGNS = new Set<WebLyricTextAlign>(['left', 'center', 'right'])
const MIN_MAIN_FONT_SIZE = 16
const MAX_MAIN_FONT_SIZE = 36
const MIN_SUB_FONT_SIZE = 10
const MAX_SUB_FONT_SIZE = 28
const MIN_INACTIVE_OPACITY = 0.2
const MAX_INACTIVE_OPACITY = 0.9

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function sanitizeFontFamily(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_WEB_LYRIC_APPEARANCE.fontFamily
}

function sanitizeTextAlign(value: unknown): WebLyricTextAlign {
  return typeof value === 'string' && VALID_TEXT_ALIGNS.has(value as WebLyricTextAlign)
    ? (value as WebLyricTextAlign)
    : DEFAULT_WEB_LYRIC_APPEARANCE.textAlign
}

function isLegacyObsoleteAppearance(value: Partial<WebLyricAppearance>): boolean {
  return (
    value.fontFamily === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.fontFamily &&
    value.mainFontSize === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.mainFontSize &&
    value.subFontSize === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.subFontSize &&
    value.textAlign === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.textAlign &&
    value.inactiveOpacity === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.inactiveOpacity &&
    value.activeTextColor === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.activeTextColor &&
    value.inactiveTextColor === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.inactiveTextColor &&
    value.translationColor === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.translationColor &&
    value.romaColor === OBSOLETE_WEB_LYRIC_APPEARANCE_V1.romaColor
  )
}

export function sanitizeWebLyricAppearance(value: unknown): WebLyricAppearance {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_WEB_LYRIC_APPEARANCE }
  }

  const record = value as Partial<Record<keyof WebLyricAppearance, unknown>>

  if (isLegacyObsoleteAppearance(record as Partial<WebLyricAppearance>)) {
    return { ...DEFAULT_WEB_LYRIC_APPEARANCE }
  }

  return {
    fontFamily: sanitizeFontFamily(record.fontFamily),
    mainFontSize: clampNumber(
      record.mainFontSize,
      DEFAULT_WEB_LYRIC_APPEARANCE.mainFontSize,
      MIN_MAIN_FONT_SIZE,
      MAX_MAIN_FONT_SIZE
    ),
    subFontSize: clampNumber(
      record.subFontSize,
      DEFAULT_WEB_LYRIC_APPEARANCE.subFontSize,
      MIN_SUB_FONT_SIZE,
      MAX_SUB_FONT_SIZE
    ),
    textAlign: sanitizeTextAlign(record.textAlign),
    inactiveOpacity: clampNumber(
      record.inactiveOpacity,
      DEFAULT_WEB_LYRIC_APPEARANCE.inactiveOpacity,
      MIN_INACTIVE_OPACITY,
      MAX_INACTIVE_OPACITY
    ),
    activeTextColor: sanitizeColor(
      record.activeTextColor,
      DEFAULT_WEB_LYRIC_APPEARANCE.activeTextColor
    ),
    inactiveTextColor: sanitizeColor(
      record.inactiveTextColor,
      DEFAULT_WEB_LYRIC_APPEARANCE.inactiveTextColor
    ),
    translationColor: sanitizeColor(
      record.translationColor,
      DEFAULT_WEB_LYRIC_APPEARANCE.translationColor
    ),
    romaColor: sanitizeColor(record.romaColor, DEFAULT_WEB_LYRIC_APPEARANCE.romaColor)
  }
}

export function patchWebLyricAppearance(
  current: WebLyricAppearance,
  patch: Partial<WebLyricAppearance>
): WebLyricAppearance {
  return sanitizeWebLyricAppearance({
    ...current,
    ...patch
  })
}
