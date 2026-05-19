import { getPlatformDescriptors } from '@/platform/music/descriptors'
import { replaceRuntimePlatformDescriptors } from '@/platform/music/descriptors'
import {
  createAnonymousPlatformAuthState,
  createErrorPlatformAuthState,
  normalizePlatformAuthState,
  type PlatformAuthState
} from '@/platform/music/authState'
import type { StandardLoginChallenge, StandardLoginField, StandardLoginMode } from '@plugin-sdk'
import type { PlatformDescriptor } from '@shared/types/platform'
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { useProjectUi } from '@/composables/useProjectUi'
import {
  BUILTIN_BRAND_THEME_PLUGIN_ID,
  PROJECT_THEME_RESOURCE_PACKS,
  type ProjectThemeResourcePack
} from '@/ui/projectUi'
import { useThemeResourcePacks } from '@/composables/useThemeResourcePacks'

const FIRST_PARTY_SMTC_PLUGIN_ID = 'builtin.smtc'
const FIRST_PARTY_COVER_SWIPE_PLUGIN_ID = 'builtin.cover-swipe'

const firstPartyPluginIds = new Set([
  FIRST_PARTY_SMTC_PLUGIN_ID,
  FIRST_PARTY_COVER_SWIPE_PLUGIN_ID,
  BUILTIN_BRAND_THEME_PLUGIN_ID
])

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
  pickInstallPath(): Promise<string | null>
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
  refresh(platformId: string): Promise<PlatformAuthState>
  logout(platformId: string): Promise<PlatformAuthState>
}

export type PluginService = {
  listPlatforms(): Promise<PlatformDescriptor[]>
  refreshPlatformDescriptors(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  auth: PluginAuthFacade
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

function normalizeLoginMode(value: unknown): StandardLoginChallenge['type'] {
  return value === 'qr' || value === 'browser' || value === 'form' || value === 'none'
    ? value
    : 'none'
}

function normalizeLoginFieldType(value: unknown): StandardLoginField['type'] {
  return value === 'password' || value === 'otp' ? value : 'text'
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

  return {
    challengeId,
    type: normalizeLoginMode(value.type),
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
    status: input.enabled ? 'ready' : 'disabled',
    capabilities: { ...firstPartyPluginCapabilities },
    ...(input.themeResources ? { themeResources: input.themeResources } : {})
  }
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
    descriptors.unshift(
      createFirstPartyPluginDescriptor({
        id: FIRST_PARTY_SMTC_PLUGIN_ID,
        displayName: 'Windows SMTC',
        description: '将播放状态同步到 Windows 系统媒体控制面板。',
        version: '1.0.0',
        category: 'extension',
        enabled: smtcEnabled.value
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

function setFirstPartyPluginEnabled(platformId: string, enabled: boolean): boolean {
  const { setSMTCEnabled, setCoverSwipeEnabled } = useExperimentalFeatures()
  const { setThemeResourcePackEnabled } = useThemeResourcePacks()

  switch (platformId) {
    case FIRST_PARTY_SMTC_PLUGIN_ID:
      setSMTCEnabled(enabled)
      return true
    case FIRST_PARTY_COVER_SWIPE_PLUGIN_ID:
      setCoverSwipeEnabled(enabled)
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

export function createPluginService(deps: PluginServiceDeps = {}): PluginService {
  const isElectron =
    deps.isElectron ?? (() => typeof window !== 'undefined' && Boolean(window.electronAPI))
  const getPluginBridge = deps.getPluginBridge ?? resolvePluginBridge

  const listBuiltinPlatforms = () =>
    mergeFirstPartyPluginDescriptors(getPlatformDescriptors(), isElectron())

  function syncPlatformDescriptors(platforms: PlatformDescriptor[]): PlatformDescriptor[] {
    const nextPlatforms = mergeFirstPartyPluginDescriptors(platforms, isElectron())
    replaceRuntimePlatformDescriptors(nextPlatforms)
    useProjectUi().ensureAvailableRenderStyle()
    return nextPlatforms
  }

  async function listPlatforms(): Promise<PlatformDescriptor[]> {
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

  async function pickInstallPath(): Promise<string | null> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin installation is only available in Electron')
    }

    return bridge.pickInstallPath()
  }

  async function setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]> {
    if (setFirstPartyPluginEnabled(platformId, enabled)) {
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
      return {}
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
      return {}
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

  async function refreshAuthState(platformId: string): Promise<PlatformAuthState> {
    return readAuthState(platformId, 'auth.refresh', {}, '登录状态刷新失败')
  }

  async function logoutAuth(platformId: string): Promise<PlatformAuthState> {
    return readAuthState(platformId, 'auth.logout', {}, '平台登出失败')
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
      refresh: refreshAuthState,
      logout: logoutAuth
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
