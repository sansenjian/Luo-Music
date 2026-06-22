import { getPlatformDescriptors } from '@/platform/music/descriptors'
import { replaceRuntimePlatformDescriptors } from '@/platform/music/descriptors'
import {
  createAnonymousPlatformAuthState,
  createErrorPlatformAuthState,
  normalizePlatformAuthState,
  type PlatformAuthState
} from '@/platform/music/authState'
import type {
  PluginSettingDefinition,
  StandardAccountProfile,
  StandardImportedAuthSession,
  StandardLoginChallenge,
  StandardLoginField,
  StandardLoginMode,
  StandardPageInfo,
  StandardPlaylistPage,
  StandardPlaylistSummary,
  StandardSongPage
} from '@plugin-sdk'
import type { PlatformDescriptor } from '@shared/types/platform'
import type { Song } from '@/platform/music/interface'
import { normalizePluginSong } from '@/platform/music/plugin/standardModels'
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { useProjectUi } from '@/composables/useProjectUi'
import {
  BUILTIN_BRAND_THEME_PLUGIN_ID,
  PROJECT_THEME_RESOURCE_PACKS,
  type ProjectThemeResourcePack
} from '@/ui/projectUi'
import { useThemeResourcePacks } from '@/composables/useThemeResourcePacks'
import { useAudioOutputPlugin } from '@/composables/useAudioOutputPlugin'
import type { AudioOutputSharedDevice } from '@/composables/useAudioOutputPlugin'
import type {
  AudioOutputBitPerfectDiagnostics,
  AudioOutputDspSettings,
  AudioOutputFormatDiagnostics,
  AudioOutputMode,
  AudioOutputSettings,
  AudioOutputStatus
} from '@shared/audioOutput/protocol'

const FIRST_PARTY_SMTC_PLUGIN_ID = 'builtin.smtc'
const FIRST_PARTY_COVER_SWIPE_PLUGIN_ID = 'builtin.cover-swipe'
const FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID = 'builtin.audio-output'
const DEFAULT_LIBRARY_PAGE_LIMIT = 50
const ALL_AUDIO_OUTPUT_MODES: AudioOutputMode[] = ['shared', 'exclusive', 'voicemeeter']
const VOICEMEETER_DEVICE_PATTERN = /voice\s*meeter|voicemeeter/i

const firstPartyPluginIds = new Set([
  FIRST_PARTY_SMTC_PLUGIN_ID,
  FIRST_PARTY_COVER_SWIPE_PLUGIN_ID,
  FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID,
  BUILTIN_BRAND_THEME_PLUGIN_ID
])

const baseAudioOutputSettingsSchema: PluginSettingDefinition[] = [
  {
    key: 'mode',
    type: 'select',
    label: '输出模式',
    default: 'shared',
    options: [
      { value: 'shared', label: '共享模式' },
      { value: 'exclusive', label: '真独占模式' },
      { value: 'voicemeeter', label: '类独占模式（Voicemeeter）' }
    ]
  },
  {
    key: 'sharedDeviceId',
    type: 'select',
    label: 'Chromium / 回退输出设备',
    default: '',
    options: [{ value: '', label: '系统默认输出设备' }]
  },
  {
    key: 'deviceId',
    type: 'select',
    label: '原生输出设备',
    default: '',
    options: [{ value: '', label: '原生默认输出设备' }]
  },
  {
    key: 'bufferFrames',
    type: 'text',
    label: 'Buffer frames',
    default: 960
  },
  {
    key: 'fallbackToShared',
    type: 'boolean',
    label: '独占失败时回退共享模式',
    default: true
  },
  {
    key: 'bitPerfectRequired',
    type: 'boolean',
    label: '强制 bit-perfect 候选输出',
    default: false
  },
  {
    key: 'dspEnabled',
    type: 'boolean',
    label: '启用 DSP 处理',
    default: false
  },
  {
    key: 'dspHeadroomDb',
    type: 'text',
    label: 'DSP headroom (dB)',
    default: 0
  },
  {
    key: 'voicemeeterBus',
    type: 'select',
    label: 'VoiceMeeter bus',
    default: 'A1',
    options: [
      { value: 'A1', label: 'A1' },
      { value: 'A2', label: 'A2' },
      { value: 'A3', label: 'A3' },
      { value: 'B1', label: 'B1' },
      { value: 'B2', label: 'B2' },
      { value: 'B3', label: 'B3' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutBus',
    type: 'select',
    label: 'VoiceMeeter HARDWARE OUT',
    default: 'A1',
    options: [
      { value: 'A1', label: 'A1' },
      { value: 'A2', label: 'A2' },
      { value: 'A3', label: 'A3' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutDriver',
    type: 'select',
    label: 'HARDWARE OUT 驱动',
    default: 'wdm',
    options: [
      { value: 'wdm', label: 'WDM' },
      { value: 'mme', label: 'MME' },
      { value: 'ks', label: 'KS' },
      { value: 'asio', label: 'ASIO' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutDevice',
    type: 'text',
    label: 'HARDWARE OUT 设备名',
    default: ''
  },
  {
    key: 'diagnosticsEnabled',
    type: 'boolean',
    label: '启用诊断日志',
    default: false
  }
]

const firstPartyPluginCapabilities = {
  search: false,
  songUrl: false,
  songDetail: false,
  lyric: false,
  playlistDetail: false,
  needsHydration: false,
  supportsLyricFetch: false,
  supportsUrlRefreshOnFailure: false
} satisfies PlatformDescriptor['capabilities']

export type PluginBridge = {
  list(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(mode?: 'file' | 'directory'): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
  onChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void
}

export type PluginAuthFacade = {
  getState(platformId: string): Promise<PlatformAuthState>
  startLogin(
    platformId: string,
    options?: { mode?: StandardLoginMode }
  ): Promise<StandardLoginChallenge>
  pollLogin(platformId: string, challengeId: string): Promise<PlatformAuthState>
  submitLogin(
    platformId: string,
    challengeId: string,
    values: Record<string, string>
  ): Promise<PlatformAuthState>
  cancelLogin(platformId: string, challengeId: string): Promise<void>
  importSession(
    platformId: string,
    session: StandardImportedAuthSession
  ): Promise<PlatformAuthState>
  refresh(platformId: string): Promise<PlatformAuthState>
  logout(platformId: string): Promise<PlatformAuthState>
}

export type PluginAccountFacade = {
  getProfile(platformId: string, userId?: string | number): Promise<StandardAccountProfile | null>
}

export type PluginLibraryFacade = {
  getLikedSongs(
    platformId: string,
    options?: { userId?: string | number; limit?: number; offset?: number }
  ): Promise<StandardSongPage>
  getPlaylists(
    platformId: string,
    options?: { userId?: string | number; limit?: number; offset?: number }
  ): Promise<StandardPlaylistPage>
  getPlaylistTracks(
    platformId: string,
    playlistId: string | number,
    options?: { limit?: number; offset?: number }
  ): Promise<StandardSongPage>
}

export type PluginService = {
  listPlatforms(): Promise<PlatformDescriptor[]>
  refreshPlatformDescriptors(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(mode?: 'file' | 'directory'): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  auth: PluginAuthFacade
  account: PluginAccountFacade
  library: PluginLibraryFacade
  getAuthState(platformId: string): Promise<PlatformAuthState>
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
  onPlatformsChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void
}

export type PluginServiceDeps = {
  isElectron?: () => boolean
  getPluginBridge?: () => PluginBridge | undefined
}

type FirstPartyPluginCategory = NonNullable<PlatformDescriptor['category']>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizePageLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : DEFAULT_LIBRARY_PAGE_LIMIT
}

function normalizePageOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function normalizeLoginMode(value: unknown): StandardLoginChallenge['type'] | undefined {
  return value === 'qr' || value === 'browser' || value === 'form' || value === 'none'
    ? value
    : undefined
}

function normalizeLoginFieldType(value: unknown): StandardLoginField['type'] {
  return value === 'password' || value === 'otp' ? value : 'text'
}

function isStandardId(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined
}

function normalizeAccountProfile(value: unknown): StandardAccountProfile | null {
  if (!isRecord(value) || !isStandardId(value.id)) {
    return null
  }

  const nickname = normalizeString(value.nickname)
  if (!nickname) {
    return null
  }

  return {
    id: value.id,
    nickname,
    ...(normalizeString(value.avatarUrl) ? { avatarUrl: normalizeString(value.avatarUrl) } : {}),
    ...(normalizeString(value.homepageUrl)
      ? { homepageUrl: normalizeString(value.homepageUrl) }
      : {}),
    ...(isRecord(value.extra) ? { extra: { ...value.extra } } : {})
  }
}

function normalizePageInfo(
  value: unknown,
  fallback: { limit: number; offset: number; itemCount: number }
): StandardPageInfo {
  const page = isRecord(value) ? value : {}
  const limit = normalizeOptionalNumber(page.limit) ?? fallback.limit
  const offset = normalizeOptionalNumber(page.offset) ?? fallback.offset
  const total = normalizeOptionalNumber(page.total)
  const hasMore =
    typeof page.hasMore === 'boolean'
      ? page.hasMore
      : total !== undefined
        ? offset + fallback.itemCount < total
        : fallback.itemCount >= limit && limit > 0

  return {
    limit,
    offset,
    ...(total !== undefined ? { total } : {}),
    hasMore
  }
}

function normalizePlaylistSummary(value: unknown): StandardPlaylistSummary | null {
  if (!isRecord(value) || !isStandardId(value.id)) {
    return null
  }

  const name = normalizeString(value.name)
  if (!name) {
    return null
  }

  const creator = normalizeAccountProfile(value.creator)
  const trackCount = normalizeOptionalNumber(value.trackCount)

  return {
    id: value.id,
    name,
    ...(normalizeString(value.coverImgUrl)
      ? { coverImgUrl: normalizeString(value.coverImgUrl) }
      : {}),
    ...(normalizeString(value.description)
      ? { description: normalizeString(value.description) }
      : {}),
    ...(trackCount !== undefined ? { trackCount } : {}),
    ...(typeof value.subscribed === 'boolean' ? { subscribed: value.subscribed } : {}),
    ...(creator ? { creator } : {}),
    ...(isRecord(value.extra) ? { extra: { ...value.extra } } : {})
  }
}

function normalizeSongPage(
  value: unknown,
  platformId: string,
  fallback: { limit: number; offset: number }
): StandardSongPage {
  const record = isRecord(value) ? value : {}
  const rawList = Array.isArray(record.list) ? record.list : []
  const list = rawList
    .map(item => normalizePluginSong(item, platformId))
    .filter((song): song is Song => song !== null)

  return {
    list,
    page: normalizePageInfo(record.page, {
      ...fallback,
      itemCount: list.length
    })
  }
}

function normalizePlaylistPage(
  value: unknown,
  fallback: { limit: number; offset: number }
): StandardPlaylistPage {
  const record = isRecord(value) ? value : {}
  const rawList = Array.isArray(record.list) ? record.list : []
  const list = rawList
    .map(normalizePlaylistSummary)
    .filter((playlist): playlist is StandardPlaylistSummary => playlist !== null)

  return {
    list,
    page: normalizePageInfo(record.page, {
      ...fallback,
      itemCount: list.length
    })
  }
}

function normalizeLibraryPageOptions(options: {
  userId?: string | number
  limit?: number
  offset?: number
}): { userId?: string | number; limit: number; offset: number } {
  return {
    ...(options.userId !== undefined ? { userId: options.userId } : {}),
    limit: normalizePageLimit(options.limit),
    offset: normalizePageOffset(options.offset)
  }
}

function normalizeLoginFields(value: unknown): StandardLoginField[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const fields = value
    .filter(isRecord)
    .map(field => {
      const key = normalizeString(field.key)
      const label = normalizeString(field.label)

      if (!key || !label) {
        return null
      }

      return {
        key,
        label,
        type: normalizeLoginFieldType(field.type),
        ...(normalizeBoolean(field.required) !== undefined
          ? { required: normalizeBoolean(field.required) }
          : {})
      } satisfies StandardLoginField
    })
    .filter((field): field is StandardLoginField => field !== null)

  return fields.length > 0 ? fields : undefined
}

function normalizeLoginChallenge(value: unknown): StandardLoginChallenge {
  if (!isRecord(value)) {
    throw new Error('Invalid login challenge')
  }

  const challengeId = normalizeString(value.challengeId)
  if (!challengeId) {
    throw new Error('Login challenge missing challengeId')
  }

  const type = normalizeLoginMode(value.type)
  if (!type) {
    throw new Error('Login challenge missing or invalid type')
  }

  return {
    challengeId,
    type,
    ...(normalizeString(value.title) ? { title: normalizeString(value.title) } : {}),
    ...(normalizeString(value.statusText) ? { statusText: normalizeString(value.statusText) } : {}),
    ...(normalizeString(value.qrImageUrl) ? { qrImageUrl: normalizeString(value.qrImageUrl) } : {}),
    ...(normalizeString(value.authorizeUrl)
      ? { authorizeUrl: normalizeString(value.authorizeUrl) }
      : {}),
    ...(normalizeNumber(value.expiresAt) !== undefined
      ? { expiresAt: normalizeNumber(value.expiresAt) }
      : {}),
    ...(normalizeNumber(value.pollIntervalMs) !== undefined
      ? { pollIntervalMs: normalizeNumber(value.pollIntervalMs) }
      : {}),
    ...(normalizeBoolean(value.canRefresh) !== undefined
      ? { canRefresh: normalizeBoolean(value.canRefresh) }
      : {}),
    ...(normalizeBoolean(value.cancelable) !== undefined
      ? { cancelable: normalizeBoolean(value.cancelable) }
      : {}),
    ...(normalizeString(value.helpUrl) ? { helpUrl: normalizeString(value.helpUrl) } : {}),
    ...(normalizeLoginFields(value.fields) ? { fields: normalizeLoginFields(value.fields) } : {})
  }
}

function resolvePluginBridge(): PluginBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window & { services?: { plugins?: PluginBridge } }).services?.plugins
}

function createFirstPartyPluginDescriptor(input: {
  id: string
  displayName: string
  description: string
  version: string
  category: FirstPartyPluginCategory
  enabled: boolean
  status?: PlatformDescriptor['status']
  lastError?: string
  settingsSchema?: PlatformDescriptor['settingsSchema']
  runtimeDetails?: PlatformDescriptor['runtimeDetails']
  runtimeState?: PlatformDescriptor['runtimeState']
  themeResources?: PlatformDescriptor['themeResources']
}): PlatformDescriptor {
  return {
    id: input.id,
    displayName: input.displayName,
    description: input.description,
    version: input.version,
    source: 'builtin',
    runtime: 'local',
    category: input.category,
    enabled: input.enabled,
    status: input.status ?? (input.enabled ? 'ready' : 'disabled'),
    capabilities: { ...firstPartyPluginCapabilities },
    ...(input.lastError ? { lastError: input.lastError } : {}),
    ...(input.settingsSchema ? { settingsSchema: input.settingsSchema } : {}),
    ...(input.runtimeDetails ? { runtimeDetails: input.runtimeDetails } : {}),
    ...(input.runtimeState ? { runtimeState: input.runtimeState } : {}),
    ...(input.themeResources ? { themeResources: input.themeResources } : {})
  }
}

function getAudioOutputModeLabel(mode: AudioOutputStatus['requestedMode']): string {
  switch (mode) {
    case 'shared':
      return '共享模式'
    case 'exclusive':
      return '真独占模式'
    case 'voicemeeter':
      return '类独占模式（Voicemeeter）'
  }
}

function resolveSharedOutputDeviceLabel(
  deviceId: string,
  sharedOutputDevices: readonly AudioOutputSharedDevice[]
): string {
  if (!deviceId) {
    return '系统默认输出设备'
  }

  return sharedOutputDevices.find(device => device.id === deviceId)?.label ?? deviceId
}

function resolveNativeOutputDeviceLabel(
  status: AudioOutputStatus,
  settings: AudioOutputSettings
): string {
  const deviceId = status.deviceId ?? settings.deviceId
  if (!deviceId) {
    return '原生默认输出设备'
  }

  return status.devices.find(device => device.id === deviceId)?.name ?? deviceId
}

function isVoicemeeterAudioOutputDevice(device: AudioOutputStatus['devices'][number]): boolean {
  return (
    device.backend === 'voicemeeter' ||
    VOICEMEETER_DEVICE_PATTERN.test(device.id) ||
    VOICEMEETER_DEVICE_PATTERN.test(device.name)
  )
}

function localizeAudioOutputReason(reason: string): string {
  const knownReasons: Record<string, string> = {
    'Native audio output backend is starting.': '原生音频输出后端正在启动。',
    'Native audio output backend is not bundled yet.': '原生音频输出后端暂未打包。',
    'Native audio output helper is starting.': '原生音频 helper 正在启动。',
    'Native audio output is disabled.': '原生音频输出已停用。',
    'Native audio output is only available on Windows.': '原生音频输出仅支持 Windows。',
    'Native audio output must be enabled before playing a test tone.':
      '播放测试音前需要先启用原生音频输出。',
    'Native audio output service did not return a test tone status.':
      '原生音频输出服务没有返回测试音状态。',
    'Native audio output service is unavailable.': '原生音频输出服务不可用。',
    'Native audio output service is unavailable in this runtime.':
      '当前运行环境不支持原生音频输出服务。',
    'Native audio output playback is paused.': '原生音频输出播放已暂停。',
    'Native audio output playback is resuming.': '原生音频输出正在恢复播放。',
    'Native audio output playback is starting.': '原生音频输出正在开始播放。',
    'Native audio output playback is starting while remote media continues caching.':
      '原生音频输出正在开始播放，在线音频会继续缓存。',
    'Native audio output is caching remote media before playback.':
      '正在为原生音频输出缓存在线音频。',
    'Native audio output remote media cache completed.': '原生音频输出在线缓存已完成。',
    'Native audio output test tone is playing.': '正在播放原生音频输出测试音。',
    'Native WASAPI exclusive file playback completed.': 'WASAPI 独占模式本地播放已完成。',
    'Native WASAPI exclusive file playback is starting.': 'WASAPI 独占模式正在开始本地播放。',
    'Native WASAPI exclusive file playback stopped.': 'WASAPI 独占模式本地播放已停止。',
    'Rust audio output helper binary was not found.': '未找到 Rust 音频输出 helper。',
    'Selected output device is unavailable.': '选择的原生输出设备不可用。',
    'Shared native file playback is running.': '正在通过共享模式播放本地音频。',
    'Shared output stream initialized with silent native probe.':
      '共享模式已通过原生静音探测初始化。',
    'Shared test tone completed.': '共享模式测试音已完成。',
    'Voicemeeter virtual input device is unavailable.': '未检测到可用的 VoiceMeeter 虚拟输入设备。',
    'Voicemeeter virtual input route is available.': 'VoiceMeeter 虚拟输入路由可用。',
    'Voicemeeter native file playback is running.': '正在通过 VoiceMeeter 虚拟输入播放音频。',
    'WASAPI exclusive output is only available on Windows.': 'WASAPI 独占输出仅支持 Windows。',
    'WASAPI exclusive output is only available on Windows; using shared fallback.':
      'WASAPI 独占输出仅支持 Windows，当前已回退到共享模式。',
    'WASAPI exclusive initialization is pending.': 'WASAPI 独占模式等待测试或本地播放。',
    'WASAPI exclusive initialization is pending; using shared fallback.':
      'WASAPI 独占模式等待测试或本地播放，当前已回退到共享模式。',
    'WASAPI exclusive native file playback is running.': 'WASAPI 独占模式正在播放本地音频。'
  }

  if (knownReasons[reason]) {
    return knownReasons[reason]
  }

  const exclusiveStartingDevicePrefix =
    'Native WASAPI exclusive file playback is starting on device: '
  if (reason.startsWith(exclusiveStartingDevicePrefix)) {
    return `WASAPI 独占模式正在开始本地播放，设备：${reason
      .replace(exclusiveStartingDevicePrefix, '')
      .trim()}`
  }

  const exclusiveRunningDevicePrefix =
    'WASAPI exclusive native file playback is running on device: '
  if (reason.startsWith(exclusiveRunningDevicePrefix)) {
    return `WASAPI 独占模式正在播放本地音频，设备：${reason
      .replace(exclusiveRunningDevicePrefix, '')
      .trim()}`
  }

  if (reason.startsWith('WASAPI exclusive test tone completed.')) {
    const detail = reason.replace('WASAPI exclusive test tone completed.', '').trim()
    return detail ? `WASAPI 独占模式测试音已完成：${detail}` : 'WASAPI 独占模式测试音已完成。'
  }

  const voicemeeterTestTonePrefix = 'Voicemeeter test tone completed through virtual input: '
  if (reason.startsWith(voicemeeterTestTonePrefix)) {
    return `VoiceMeeter 测试音已通过虚拟输入完成：${reason
      .replace(voicemeeterTestTonePrefix, '')
      .trim()}`
  }

  const voicemeeterRoutedMatch = reason.match(
    /^Voicemeeter Remote API connected and routed Strip\[(\d+)\]\.([AB]\d)\.$/
  )
  if (voicemeeterRoutedMatch) {
    return `VoiceMeeter Remote API 已连接，已路由 Strip[${voicemeeterRoutedMatch[1]}] 到 ${voicemeeterRoutedMatch[2]}。`
  }

  const voicemeeterHardwareOutRoutedMatch = reason.match(
    /^Voicemeeter Remote API connected and routed Strip\[(\d+)\]\.([AB]\d)\. HARDWARE OUT (A[123]) ([A-Z]+): (.+) (applied|failed|skipped)\.$/
  )
  if (voicemeeterHardwareOutRoutedMatch) {
    const [, strip, routeBus, hardwareBus, driver, device, outcome] =
      voicemeeterHardwareOutRoutedMatch
    const outcomeLabel =
      outcome === 'applied' ? '已应用' : outcome === 'failed' ? '应用失败' : '已跳过'
    return `VoiceMeeter Remote API 已连接，已路由 Strip[${strip}] 到 ${routeBus}；HARDWARE OUT ${hardwareBus} ${driver}: ${device} ${outcomeLabel}。`
  }

  const voicemeeterRouteFailedMatch = reason.match(
    /^Voicemeeter Remote API connected, but routing Strip\[(\d+)\]\.([AB]\d) failed\.$/
  )
  if (voicemeeterRouteFailedMatch) {
    return `VoiceMeeter Remote API 已连接，但路由 Strip[${voicemeeterRouteFailedMatch[1]}] 到 ${voicemeeterRouteFailedMatch[2]} 失败。`
  }

  if (reason === 'Voicemeeter Remote API connected.') {
    return 'VoiceMeeter Remote API 已连接。'
  }

  if (reason.startsWith('Voicemeeter Remote API unavailable:')) {
    return `VoiceMeeter Remote API 不可用：${reason
      .replace('Voicemeeter Remote API unavailable:', '')
      .trim()}`
  }

  if (
    reason.startsWith('WASAPI exclusive test tone failed:') &&
    reason.includes('; shared fallback test tone completed.')
  ) {
    return `WASAPI 独占模式测试音失败，已完成共享模式回退测试：${reason
      .replace('WASAPI exclusive test tone failed:', '')
      .replace('; shared fallback test tone completed.', '')
      .trim()}`
  }

  if (
    reason.startsWith('WASAPI exclusive file playback failed:') &&
    reason.includes('; using shared fallback.')
  ) {
    return `WASAPI 独占模式播放失败，正在使用共享模式回退：${reason
      .replace('WASAPI exclusive file playback failed:', '')
      .replace('; using shared fallback.', '')
      .trim()}`
  }

  if (reason.startsWith('WASAPI exclusive test tone failed:')) {
    return `WASAPI 独占模式测试音失败：${reason
      .replace('WASAPI exclusive test tone failed:', '')
      .trim()}`
  }

  if (reason.startsWith('Native WASAPI exclusive file playback failed:')) {
    return `WASAPI 独占模式本地播放失败：${reason
      .replace('Native WASAPI exclusive file playback failed:', '')
      .trim()}`
  }

  if (reason.startsWith('Failed to start Rust audio output helper:')) {
    return `启动 Rust 音频输出 helper 失败：${reason
      .replace('Failed to start Rust audio output helper:', '')
      .trim()}`
  }

  if (reason.startsWith('Failed to finish remote media cache for native audio output:')) {
    return `原生音频输出在线缓存失败：${reason
      .replace('Failed to finish remote media cache for native audio output:', '')
      .trim()}`
  }

  if (
    reason.startsWith(
      'Native audio output remote media authorization expired; refreshing the playback URL is required.'
    )
  ) {
    return '原生音频输出在线地址授权已过期，正在尝试刷新播放地址。'
  }

  if (
    reason ===
    'Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; shared mode is not allowed.'
  ) {
    return '已开启 bit-perfect 保护，播放必须走 WASAPI 真独占 raw PCM 直通；共享模式不可用。'
  }

  if (
    reason ===
    'Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; Voicemeeter routing is not allowed.'
  ) {
    return '已开启 bit-perfect 保护，播放必须走 WASAPI 真独占 raw PCM 直通；Voicemeeter 路由不可用。'
  }

  if (
    reason ===
    'Bit-perfect required playback could not start because the source was not a WASAPI exclusive raw PCM passthrough candidate.'
  ) {
    return '已开启 bit-perfect 保护，但当前音源不是 WASAPI 真独占 raw PCM 直通候选，已阻止降级播放。'
  }

  if (reason.startsWith('Rust audio output helper error:')) {
    return `Rust 音频输出 helper 出错：${reason
      .replace('Rust audio output helper error:', '')
      .trim()}`
  }

  if (reason.startsWith('Rust audio output helper exited')) {
    return 'Rust 音频输出 helper 已退出。'
  }

  return reason
}

function resolveAudioOutputReasonTone(
  status: AudioOutputStatus
): NonNullable<PlatformDescriptor['runtimeDetails']>[number]['tone'] {
  if (status.backend !== 'native') {
    return 'danger'
  }

  const normalizedReason = status.reason?.toLowerCase() ?? ''
  if (
    normalizedReason.includes('failed') ||
    normalizedReason.includes('error') ||
    normalizedReason.includes('unavailable') ||
    normalizedReason.includes('not implemented')
  ) {
    return 'danger'
  }

  if (status.activeMode && status.activeMode !== status.requestedMode) {
    return 'warning'
  }

  if (normalizedReason.includes('pending')) {
    return 'warning'
  }

  if (
    normalizedReason.includes('completed') ||
    normalizedReason.includes('playing') ||
    normalizedReason.includes('running') ||
    normalizedReason.includes('initialized') ||
    normalizedReason.includes('route is available')
  ) {
    return 'success'
  }

  return 'warning'
}

function resolveBitPerfectTone(
  status: AudioOutputBitPerfectDiagnostics['status']
): NonNullable<PlatformDescriptor['runtimeDetails']>[number]['tone'] {
  switch (status) {
    case 'candidate':
      return 'warning'
    case 'notCandidate':
      return 'neutral'
    case 'unverified':
      return 'warning'
  }
}

function getBitPerfectStatusLabel(status: AudioOutputBitPerfectDiagnostics['status']): string {
  switch (status) {
    case 'candidate':
      return '候选（仍需 loopback / DAC 验证）'
    case 'notCandidate':
      return '非候选'
    case 'unverified':
      return '未验证'
  }
}

function formatAudioOutputDiagnostics(format: AudioOutputFormatDiagnostics): string {
  const bitDepth = format.bitDepth ? `${format.bitDepth}-bit ` : ''
  const source = format.source ? ` · ${format.source}` : ''

  return `${format.sampleRate} Hz / ${format.channels}ch / ${bitDepth}${format.sampleFormat}${source}`
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kib = bytes / 1024
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`
  }

  return `${(kib / 1024).toFixed(1)} MiB`
}

function createNativePlaybackDownloadRuntimeDetails(
  download: AudioOutputStatus['nativePlaybackDownload']
): NonNullable<PlatformDescriptor['runtimeDetails']> {
  if (!download) {
    return []
  }

  const total =
    typeof download.totalBytes === 'number' ? ` / ${formatByteSize(download.totalBytes)}` : ''
  return [
    {
      label: '在线缓存',
      value: `${download.state === 'cached' ? '已缓存' : '下载中'} ${formatByteSize(download.bytesReceived)}${total}`,
      tone: download.state === 'cached' ? 'success' : 'warning'
    },
    ...(typeof download.rangeSupported === 'boolean'
      ? [
          {
            label: '在线 Range',
            value: download.rangeSupported ? '支持' : '不支持',
            tone: download.rangeSupported ? 'success' : 'warning'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(download.strategy
      ? [
          {
            label: '在线策略',
            value: download.strategy === 'range-chunk' ? 'Range 分段缓存' : '单响应缓存',
            tone: 'neutral'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : [])
  ]
}

function localizeBitPerfectReason(reason: string): string {
  if (reason === 'Only WASAPI exclusive playback can be a bit-perfect candidate.') {
    return '只有 WASAPI 真独占播放才可能成为 bit-perfect 候选。'
  }

  if (reason === 'Playback volume is not unity, so samples are scaled before output.') {
    return '播放音量不是 100%，输出前会缩放样本。'
  }

  if (
    reason ===
    'WASAPI exclusive output format matches source sample rate/channels/sample format and playback volume is unity; loopback or DAC verification is still required.'
  ) {
    return 'WASAPI 独占输出格式与源采样率/声道/样本格式匹配，且播放音量为 100%；仍需 loopback 或 DAC 状态验证。'
  }

  if (
    reason ===
    'Bit-perfect diagnostics are available after WASAPI exclusive native file playback starts.'
  ) {
    return '开始 WASAPI 独占原生播放后才会生成 bit-perfect 诊断。'
  }

  if (
    reason ===
    "Source samples are flowing through the helper's decoded-f32 streaming pipeline, so the original file sample bits are not preserved for bit-perfect output."
  ) {
    return '音源正在经过 helper 的 decoded-f32 流式解码路径，无法保留原始文件样本位。'
  }

  const sampleRateMismatch = reason.match(
    /^Source sample rate (\d+) Hz does not match output sample rate (\d+) Hz\.$/
  )
  if (sampleRateMismatch) {
    return `源采样率 ${sampleRateMismatch[1]} Hz 与输出采样率 ${sampleRateMismatch[2]} Hz 不一致。`
  }

  const channelMismatch = reason.match(
    /^Source channel count (\d+) does not match output channel count (\d+)\.$/
  )
  if (channelMismatch) {
    return `源声道数 ${channelMismatch[1]} 与输出声道数 ${channelMismatch[2]} 不一致。`
  }

  const sampleFormatMismatch = reason.match(
    /^Source sample format (.+) does not match output sample format (.+); helper sample conversion would be required\.$/
  )
  if (sampleFormatMismatch) {
    return `源样本格式 ${sampleFormatMismatch[1]} 与输出样本格式 ${sampleFormatMismatch[2]} 不一致，需要转换后才能输出。`
  }

  return reason
}

function createBitPerfectRuntimeDetails(
  diagnostics: AudioOutputStatus['bitPerfect']
): NonNullable<PlatformDescriptor['runtimeDetails']> {
  if (!diagnostics) {
    return []
  }

  const tone = resolveBitPerfectTone(diagnostics.status)
  return [
    {
      label: 'bit-perfect',
      value: getBitPerfectStatusLabel(diagnostics.status),
      tone
    },
    ...(diagnostics.sourceFormat
      ? [
          {
            label: '源格式',
            value: formatAudioOutputDiagnostics(diagnostics.sourceFormat),
            tone: 'neutral'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(diagnostics.outputFormat
      ? [
          {
            label: '输出格式',
            value: formatAudioOutputDiagnostics(diagnostics.outputFormat),
            tone: 'neutral'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(typeof diagnostics.volume === 'number'
      ? [
          {
            label: '原生音量',
            value: `${Math.round(diagnostics.volume * 100)}%`,
            tone: diagnostics.volume === 1 ? 'neutral' : 'warning'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    {
      label: 'bit-perfect 说明',
      value: localizeBitPerfectReason(diagnostics.reason),
      tone
    }
  ]
}

function getVoicemeeterRemoteKindLabel(
  kind: NonNullable<AudioOutputStatus['voicemeeterRemote']>['kind']
): string {
  switch (kind) {
    case 'standard':
      return 'VoiceMeeter'
    case 'banana':
      return 'VoiceMeeter Banana'
    case 'potato':
      return 'VoiceMeeter Potato'
    case 'unknown':
      return '未知版本'
    default:
      return '未知'
  }
}

function createVoicemeeterRemoteRuntimeDetails(
  remote: AudioOutputStatus['voicemeeterRemote']
): NonNullable<PlatformDescriptor['runtimeDetails']> {
  if (!remote) {
    return []
  }

  const statusValue = !remote.available ? 'DLL 不可用' : remote.connected ? '已连接' : '未连接'
  const statusTone = !remote.available ? 'warning' : remote.connected ? 'success' : 'warning'
  const routeBus = remote.routeBus ?? 'A1'
  const hardwareOutDevice = remote.hardwareOutDevice?.trim()

  return [
    {
      label: 'VoiceMeeter Remote API',
      value: statusValue,
      tone: statusTone
    },
    ...(remote.kind
      ? [
          {
            label: 'VoiceMeeter 类型',
            value: remote.version
              ? `${getVoicemeeterRemoteKindLabel(remote.kind)} ${remote.version}`
              : getVoicemeeterRemoteKindLabel(remote.kind),
            tone: 'neutral'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(typeof remote.virtualInputStrip === 'number'
      ? [
          {
            label: 'VoiceMeeter 输入',
            value: `Strip[${remote.virtualInputStrip}]`,
            tone: 'neutral'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(typeof remote.routeApplied === 'boolean'
      ? [
          {
            label: 'VoiceMeeter 路由',
            value: remote.routeApplied ? `${routeBus} 已应用` : `${routeBus} 未应用`,
            tone: remote.routeApplied ? 'success' : 'warning'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(typeof remote.routeManaged === 'boolean'
      ? [
          {
            label: 'VoiceMeeter 路由恢复',
            value: remote.routeManaged ? '已记录' : '未记录',
            tone: remote.routeManaged ? 'success' : 'warning'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(hardwareOutDevice
      ? [
          {
            label: 'HARDWARE OUT',
            value: `${remote.hardwareOutBus ?? 'A1'} ${(
              remote.hardwareOutDriver ?? 'wdm'
            ).toUpperCase()}: ${hardwareOutDevice}`,
            tone: remote.hardwareOutApplied === false ? 'warning' : 'success'
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : []),
    ...(remote.reason
      ? [
          {
            label: 'VoiceMeeter 说明',
            value: localizeAudioOutputReason(remote.reason),
            tone: statusTone
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : [])
  ]
}

function createAudioOutputRuntimeDetails(
  status: AudioOutputStatus,
  settings: AudioOutputSettings,
  sharedOutputDevices: readonly AudioOutputSharedDevice[]
): PlatformDescriptor['runtimeDetails'] {
  const actualOutputValue =
    status.backend === 'disabled'
      ? '已停用'
      : status.activeMode
        ? getAudioOutputModeLabel(status.activeMode)
        : status.backend === 'native' && status.requestedMode === 'exclusive'
          ? '等待真独占测试/播放'
          : status.backend === 'native'
            ? '等待原生后端'
            : '不可用'
  const activeOutputTone =
    status.backend === 'disabled'
      ? 'neutral'
      : status.backend !== 'native'
        ? 'danger'
        : !status.activeMode
          ? 'warning'
          : status.activeMode && status.activeMode !== status.requestedMode
            ? 'warning'
            : 'success'

  return [
    {
      label: '请求模式',
      value: getAudioOutputModeLabel(status.requestedMode),
      tone: status.enabled ? 'neutral' : 'warning'
    },
    {
      label: '实际输出',
      value:
        status.activeMode && status.activeMode !== status.requestedMode
          ? `${actualOutputValue}（已回退）`
          : actualOutputValue,
      tone: activeOutputTone
    },
    {
      label: 'Chromium / 回退设备',
      value: resolveSharedOutputDeviceLabel(settings.sharedDeviceId, sharedOutputDevices)
    },
    {
      label: '原生设备',
      value: resolveNativeOutputDeviceLabel(status, settings)
    },
    {
      label: '原生 helper',
      value: status.helperRunning ? '运行中' : '未运行',
      tone: status.helperRunning ? 'success' : status.enabled ? 'warning' : 'neutral'
    },
    {
      label: 'bit-perfect 保护',
      value: settings.bitPerfectRequired ? '开启' : '关闭',
      tone: settings.bitPerfectRequired ? 'warning' : 'neutral'
    },
    ...createVoicemeeterRemoteRuntimeDetails(status.voicemeeterRemote),
    ...createNativePlaybackDownloadRuntimeDetails(status.nativePlaybackDownload),
    ...createBitPerfectRuntimeDetails(status.bitPerfect),
    ...(status.reason
      ? [
          {
            label: '说明',
            value: localizeAudioOutputReason(status.reason),
            tone: resolveAudioOutputReasonTone(status)
          } satisfies NonNullable<PlatformDescriptor['runtimeDetails']>[number]
        ]
      : [])
  ]
}

function resolveAudioOutputDescriptorStatus(status: AudioOutputStatus): {
  pluginStatus: PlatformDescriptor['status']
  lastError?: string
} {
  if (!status.enabled) {
    return { pluginStatus: 'disabled' }
  }

  if (status.backend === 'native') {
    return { pluginStatus: 'ready' }
  }

  return {
    pluginStatus: 'error',
    lastError: status.reason
      ? localizeAudioOutputReason(status.reason)
      : '原生音频输出后端暂不可用。'
  }
}

function createAudioOutputSettingsSchema(
  status: AudioOutputStatus,
  settings: AudioOutputSettings,
  sharedOutputDevices: readonly AudioOutputSharedDevice[]
): PluginSettingDefinition[] {
  return baseAudioOutputSettingsSchema.map(definition => {
    if (definition.key === 'mode') {
      return createAudioOutputModeSetting(definition, status, settings)
    }

    if (definition.key === 'sharedDeviceId') {
      const sharedDeviceOptions = sharedOutputDevices.map(device => ({
        value: device.id,
        label: device.label
      }))
      const knownSharedDeviceIds = new Set(sharedDeviceOptions.map(option => option.value))
      const selectedSharedDeviceOption =
        settings.sharedDeviceId && !knownSharedDeviceIds.has(settings.sharedDeviceId)
          ? [{ value: settings.sharedDeviceId, label: `当前选择：${settings.sharedDeviceId}` }]
          : []

      return {
        ...definition,
        options: [
          { value: '', label: '系统默认输出设备' },
          ...selectedSharedDeviceOption,
          ...sharedDeviceOptions
        ]
      }
    }

    if (definition.key !== 'deviceId') {
      return definition
    }

    const visibleDevices =
      settings.mode === 'voicemeeter'
        ? status.devices.filter(isVoicemeeterAudioOutputDevice)
        : status.devices
    const deviceOptions = visibleDevices.map(device => ({
      value: device.id,
      label: device.isDefault ? `${device.name}（默认）` : device.name
    }))
    const knownDeviceIds = new Set(deviceOptions.map(option => option.value))
    const selectedDeviceOption =
      settings.deviceId && !knownDeviceIds.has(settings.deviceId)
        ? [{ value: settings.deviceId, label: `当前选择：${settings.deviceId}` }]
        : []

    return {
      ...definition,
      options: [{ value: '', label: '原生默认输出设备' }, ...selectedDeviceOption, ...deviceOptions]
    }
  })
}

function createAudioOutputModeSetting(
  definition: PluginSettingDefinition,
  status: AudioOutputStatus,
  settings: AudioOutputSettings
): PluginSettingDefinition {
  const baseOptions = definition.options ?? []
  const optionByMode = new Map(baseOptions.map(option => [option.value, option]))
  const supportedModes = resolveSupportedAudioOutputModes(status)
  const supportedOptions = supportedModes
    .map(mode => optionByMode.get(mode))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))

  if (!supportedOptions.some(option => option.value === settings.mode)) {
    const selectedOption = optionByMode.get(settings.mode)
    if (selectedOption) {
      supportedOptions.push({
        ...selectedOption,
        label: `${selectedOption.label}（当前平台不可用）`
      })
    }
  }

  return {
    ...definition,
    options: supportedOptions
  }
}

function resolveSupportedAudioOutputModes(status: AudioOutputStatus): AudioOutputMode[] {
  const supportedModes = status.supportedModes?.filter(mode =>
    ALL_AUDIO_OUTPUT_MODES.includes(mode)
  )
  return supportedModes?.length ? supportedModes : ALL_AUDIO_OUTPUT_MODES
}

function createFirstPartyPluginDescriptors(isElectron: boolean): PlatformDescriptor[] {
  const { smtcEnabled, coverSwipeEnabled } = useExperimentalFeatures()
  const { isThemeResourcePackEnabled } = useThemeResourcePacks()
  const descriptors: PlatformDescriptor[] = [
    createFirstPartyPluginDescriptor({
      id: FIRST_PARTY_COVER_SWIPE_PLUGIN_ID,
      displayName: '滑动封面切歌',
      description: '在播放器封面区域左右滑动切换上一首或下一首。',
      version: '1.0.0',
      category: 'extension',
      enabled: coverSwipeEnabled.value
    })
  ]

  descriptors.push(
    ...PROJECT_THEME_RESOURCE_PACKS.map(themeResourcePack =>
      createFirstPartyThemeResourcePackDescriptor(themeResourcePack, isThemeResourcePackEnabled)
    )
  )

  if (isElectron) {
    const { audioOutputEnabled, audioOutputSettings, audioOutputStatus, sharedOutputDevices } =
      useAudioOutputPlugin()
    const { pluginStatus, lastError } = resolveAudioOutputDescriptorStatus(audioOutputStatus.value)
    descriptors.unshift(
      createFirstPartyPluginDescriptor({
        id: FIRST_PARTY_SMTC_PLUGIN_ID,
        displayName: 'Windows SMTC',
        description: '将播放状态同步到 Windows 系统媒体控制面板。',
        version: '1.0.0',
        category: 'extension',
        enabled: smtcEnabled.value
      }),
      createFirstPartyPluginDescriptor({
        id: FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID,
        displayName: '原生音频输出',
        description: '接管桌面端音频输出，提供共享、WASAPI 独占和 VoiceMeeter 路由设置入口。',
        version: '0.1.0',
        category: 'extension',
        enabled: audioOutputEnabled.value,
        status: pluginStatus,
        lastError,
        settingsSchema: createAudioOutputSettingsSchema(
          audioOutputStatus.value,
          audioOutputSettings.value,
          sharedOutputDevices.value
        ),
        runtimeDetails: createAudioOutputRuntimeDetails(
          audioOutputStatus.value,
          audioOutputSettings.value,
          sharedOutputDevices.value
        ),
        runtimeState: {
          testToneRunning: Boolean(audioOutputStatus.value.testToneRunning),
          nativePlaybackRunning: Boolean(audioOutputStatus.value.nativePlaybackRunning)
        }
      })
    )
  }

  return descriptors
}

function createFirstPartyThemeResourcePackDescriptor(
  themeResourcePack: ProjectThemeResourcePack,
  isThemeResourcePackEnabled: (themeResourcePackId: ProjectThemeResourcePack['id']) => boolean
): PlatformDescriptor {
  return createFirstPartyPluginDescriptor({
    id: themeResourcePack.id,
    displayName: themeResourcePack.label,
    description: themeResourcePack.description ?? '',
    version: '1.0.0',
    category: 'theme',
    enabled: isThemeResourcePackEnabled(themeResourcePack.id),
    themeResources: [themeResourcePack]
  })
}

function mergeFirstPartyPluginDescriptors(
  platforms: PlatformDescriptor[],
  isElectron: boolean
): PlatformDescriptor[] {
  const merged = new Map(platforms.map(platform => [platform.id, platform]))

  for (const descriptor of createFirstPartyPluginDescriptors(isElectron)) {
    merged.set(descriptor.id, descriptor)
  }

  return Array.from(merged.values())
}

function isFirstPartyPlugin(platformId: string): boolean {
  return firstPartyPluginIds.has(platformId)
}

function createAudioOutputPluginSettingsSnapshot(
  settings: AudioOutputSettings
): Record<string, unknown> {
  return {
    ...settings,
    dspEnabled: Boolean(settings.dsp?.enabled),
    dspHeadroomDb: settings.dsp?.headroomDb ?? 0
  }
}

function normalizeAudioOutputPluginSettingsUpdate(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const { dspEnabled, dspHeadroomDb, ...baseSettings } = settings

  if (dspEnabled === undefined && dspHeadroomDb === undefined) {
    return settings
  }

  const dsp = normalizeAudioOutputDspSettingsForUpdate(baseSettings.dsp, dspEnabled, dspHeadroomDb)
  return {
    ...baseSettings,
    dsp
  }
}

function normalizeAudioOutputDspSettingsForUpdate(
  currentDsp: unknown,
  enabled: unknown,
  headroomDb: unknown
): AudioOutputDspSettings {
  const current =
    currentDsp && typeof currentDsp === 'object'
      ? (currentDsp as Partial<AudioOutputDspSettings>)
      : {}
  const parsedHeadroomDb =
    typeof headroomDb === 'number'
      ? headroomDb
      : typeof headroomDb === 'string'
        ? Number.parseFloat(headroomDb)
        : current.headroomDb

  return {
    enabled: typeof enabled === 'boolean' ? enabled : Boolean(current.enabled),
    headroomDb: Number.isFinite(parsedHeadroomDb) ? Number(parsedHeadroomDb) : 0,
    eq: Array.isArray(current.eq) ? current.eq : []
  }
}

async function setFirstPartyPluginEnabled(platformId: string, enabled: boolean): Promise<boolean> {
  const { setSMTCEnabled, setCoverSwipeEnabled } = useExperimentalFeatures()
  const { setAudioOutputEnabled } = useAudioOutputPlugin()
  const { setThemeResourcePackEnabled } = useThemeResourcePacks()

  switch (platformId) {
    case FIRST_PARTY_SMTC_PLUGIN_ID:
      setSMTCEnabled(enabled)
      return true
    case FIRST_PARTY_COVER_SWIPE_PLUGIN_ID:
      setCoverSwipeEnabled(enabled)
      return true
    case FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID:
      await setAudioOutputEnabled(enabled)
      return true
    case BUILTIN_BRAND_THEME_PLUGIN_ID:
      setThemeResourcePackEnabled(BUILTIN_BRAND_THEME_PLUGIN_ID, enabled)
      if (!enabled) {
        const { renderStyle, setRenderStyle } = useProjectUi()
        if (renderStyle.value === 'brand') {
          setRenderStyle('classic')
        }
      }
      return true
    default:
      return false
  }
}

function getFirstPartyPluginSettings(platformId: string): Record<string, unknown> {
  if (platformId === FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID) {
    return createAudioOutputPluginSettingsSnapshot(useAudioOutputPlugin().audioOutputSettings.value)
  }

  return {}
}

function updateFirstPartyPluginSettings(
  platformId: string,
  settings: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (platformId === FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID) {
    return useAudioOutputPlugin().updateAudioOutputSettings(
      normalizeAudioOutputPluginSettingsUpdate(settings)
    )
  }

  return Promise.resolve({})
}

export function createPluginService(deps: PluginServiceDeps = {}): PluginService {
  const isElectron =
    deps.isElectron ?? (() => typeof window !== 'undefined' && Boolean(window.electronAPI))
  const getPluginBridge = deps.getPluginBridge ?? resolvePluginBridge

  const listBuiltinPlatforms = () =>
    mergeFirstPartyPluginDescriptors(getPlatformDescriptors(), isElectron())

  async function refreshFirstPartyPluginRuntimeState(): Promise<void> {
    if (!isElectron()) {
      return
    }

    await useAudioOutputPlugin().refreshSharedOutputDevices()
  }

  function syncPlatformDescriptors(platforms: PlatformDescriptor[]): PlatformDescriptor[] {
    const nextPlatforms = mergeFirstPartyPluginDescriptors(platforms, isElectron())
    replaceRuntimePlatformDescriptors(nextPlatforms)
    useProjectUi().ensureAvailableRenderStyle()
    return nextPlatforms
  }

  async function listPlatforms(): Promise<PlatformDescriptor[]> {
    await refreshFirstPartyPluginRuntimeState()

    if (!isElectron()) {
      return listBuiltinPlatforms()
    }

    const bridge = getPluginBridge()
    if (!bridge) {
      return listBuiltinPlatforms()
    }

    return syncPlatformDescriptors(await bridge.list())
  }

  async function refreshPlatformDescriptors(): Promise<PlatformDescriptor[]> {
    return listPlatforms()
  }

  async function installFromPath(pluginPath: string): Promise<PlatformDescriptor[]> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin installation is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.installFromPath(pluginPath))
  }

  async function pickInstallPath(mode: 'file' | 'directory' = 'file'): Promise<string | null> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin installation is only available in Electron')
    }

    return bridge.pickInstallPath(mode)
  }

  async function setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]> {
    if (await setFirstPartyPluginEnabled(platformId, enabled)) {
      return refreshPlatformDescriptors()
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.setEnabled(platformId, enabled))
  }

  async function uninstall(platformId: string): Promise<PlatformDescriptor[]> {
    if (isFirstPartyPlugin(platformId)) {
      throw new Error('First-party plugins cannot be uninstalled')
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.uninstall(platformId))
  }

  async function getSettings(platformId: string): Promise<Record<string, unknown>> {
    if (isFirstPartyPlugin(platformId)) {
      return getFirstPartyPluginSettings(platformId)
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      return {}
    }

    return bridge.getSettings(platformId)
  }

  async function updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (isFirstPartyPlugin(platformId)) {
      return updateFirstPartyPluginSettings(platformId, settings)
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    const result = await bridge.updateSettings(platformId, settings)
    await refreshPlatformDescriptors()
    return result
  }

  async function getAuthState(platformId: string): Promise<PlatformAuthState> {
    return readAuthState(platformId, 'auth.getState', {}, '登录状态读取失败')
  }

  async function readAuthState(
    platformId: string,
    method: string,
    payload: unknown,
    errorMessage: string
  ): Promise<PlatformAuthState> {
    if (isFirstPartyPlugin(platformId)) {
      return createAnonymousPlatformAuthState(platformId)
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      return createAnonymousPlatformAuthState(platformId)
    }

    try {
      return normalizePlatformAuthState(await bridge.call(platformId, method, payload), platformId)
    } catch {
      return createErrorPlatformAuthState(platformId, errorMessage)
    }
  }

  async function startLogin(
    platformId: string,
    options: { mode?: StandardLoginMode } = {}
  ): Promise<StandardLoginChallenge> {
    return normalizeLoginChallenge(
      await call(platformId, 'auth.startLogin', {
        mode: options.mode
      })
    )
  }

  async function pollLogin(platformId: string, challengeId: string): Promise<PlatformAuthState> {
    return normalizePlatformAuthState(
      await call(platformId, 'auth.pollLogin', { challengeId }),
      platformId
    )
  }

  async function submitLogin(
    platformId: string,
    challengeId: string,
    values: Record<string, string>
  ): Promise<PlatformAuthState> {
    return normalizePlatformAuthState(
      await call(platformId, 'auth.submitLogin', { challengeId, values }),
      platformId
    )
  }

  async function cancelLogin(platformId: string, challengeId: string): Promise<void> {
    await call(platformId, 'auth.cancelLogin', { challengeId })
  }

  async function importSession(
    platformId: string,
    session: StandardImportedAuthSession
  ): Promise<PlatformAuthState> {
    return normalizePlatformAuthState(
      await call(platformId, 'auth.importSession', { session }),
      platformId
    )
  }

  async function refreshAuthState(platformId: string): Promise<PlatformAuthState> {
    return readAuthState(platformId, 'auth.refresh', {}, '登录状态刷新失败')
  }

  async function logoutAuth(platformId: string): Promise<PlatformAuthState> {
    return readAuthState(platformId, 'auth.logout', {}, '平台登出失败')
  }

  async function getAccountProfile(
    platformId: string,
    userId?: string | number
  ): Promise<StandardAccountProfile | null> {
    const payload = userId !== undefined ? { userId } : {}
    return normalizeAccountProfile(await call(platformId, 'account.getProfile', payload))
  }

  async function getLikedSongs(
    platformId: string,
    options: { userId?: string | number; limit?: number; offset?: number } = {}
  ): Promise<StandardSongPage> {
    const payload = normalizeLibraryPageOptions(options)
    return normalizeSongPage(
      await call(platformId, 'library.getLikedSongs', payload),
      platformId,
      payload
    )
  }

  async function getPlaylists(
    platformId: string,
    options: { userId?: string | number; limit?: number; offset?: number } = {}
  ): Promise<StandardPlaylistPage> {
    const payload = normalizeLibraryPageOptions(options)
    return normalizePlaylistPage(await call(platformId, 'library.getPlaylists', payload), payload)
  }

  async function getPlaylistTracks(
    platformId: string,
    playlistId: string | number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<StandardSongPage> {
    const payload = normalizeLibraryPageOptions(options)
    return normalizeSongPage(
      await call(platformId, 'library.getPlaylistTracks', {
        id: playlistId,
        limit: payload.limit,
        offset: payload.offset
      }),
      platformId,
      payload
    )
  }

  async function call(platformId: string, method: string, payload: unknown): Promise<unknown> {
    if (isFirstPartyPlugin(platformId)) {
      throw new Error('First-party plugins do not expose external calls')
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('External plugin calls are only available in Electron')
    }

    return bridge.call(platformId, method, payload)
  }

  function onPlatformsChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      return () => {}
    }

    return bridge.onChanged(platforms => {
      listener(syncPlatformDescriptors(platforms))
    })
  }

  const service: PluginService = {
    listPlatforms,
    refreshPlatformDescriptors,
    installFromPath,
    pickInstallPath,
    setEnabled,
    uninstall,
    getSettings,
    updateSettings,
    auth: {
      getState: getAuthState,
      startLogin,
      pollLogin,
      submitLogin,
      cancelLogin,
      importSession,
      refresh: refreshAuthState,
      logout: logoutAuth
    },
    account: {
      getProfile: getAccountProfile
    },
    library: {
      getLikedSongs,
      getPlaylists,
      getPlaylistTracks
    },
    getAuthState,
    call,
    onPlatformsChanged
  }

  if (isElectron()) {
    Promise.resolve()
      .then(() => service.refreshPlatformDescriptors())
      .catch(() => {})
  }

  return service
}
