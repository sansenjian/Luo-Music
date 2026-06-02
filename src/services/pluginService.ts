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
import type { AudioOutputSettings, AudioOutputStatus } from '@shared/audioOutput/protocol'

const FIRST_PARTY_SMTC_PLUGIN_ID = 'builtin.smtc'
const FIRST_PARTY_COVER_SWIPE_PLUGIN_ID = 'builtin.cover-swipe'
const FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID = 'builtin.audio-output'
const DEFAULT_LIBRARY_PAGE_LIMIT = 50

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
      return '类独占模式'
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
        : status.backend === 'native'
          ? '等待原生后端'
          : '不可用'
  const activeOutputTone =
    status.backend === 'disabled'
      ? 'neutral'
      : status.backend !== 'native'
        ? 'danger'
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
    ...(status.reason
      ? [
          {
            label: '说明',
            value: status.reason,
            tone: status.backend === 'native' ? 'warning' : 'danger'
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
    lastError: status.reason ?? '原生音频输出后端暂不可用。'
  }
}

function createAudioOutputSettingsSchema(
  status: AudioOutputStatus,
  settings: AudioOutputSettings,
  sharedOutputDevices: readonly AudioOutputSharedDevice[]
): PluginSettingDefinition[] {
  return baseAudioOutputSettingsSchema.map(definition => {
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

    const deviceOptions = status.devices.map(device => ({
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
        description: '接管桌面端音频输出，提供共享、独占和 Voicemeeter 模式的设置入口。',
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
          testToneRunning: Boolean(audioOutputStatus.value.testToneRunning)
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
    return { ...useAudioOutputPlugin().audioOutputSettings.value }
  }

  return {}
}

function updateFirstPartyPluginSettings(
  platformId: string,
  settings: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (platformId === FIRST_PARTY_AUDIO_OUTPUT_PLUGIN_ID) {
    return useAudioOutputPlugin().updateAudioOutputSettings(settings)
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
