import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'
import type { PlatformDescriptor } from '@shared/types/platform'
import { services } from '@/services'
import { useAudioOutputPlugin } from '@/composables/useAudioOutputPlugin'
import type { PluginService } from '@/services/pluginService'
import type { PlatformService } from '@/services/platformService'

const AUDIO_OUTPUT_PLUGIN_ID = 'builtin.audio-output'

type PluginSettingDefinition = {
  key: string
  type: 'boolean' | 'text' | 'select'
  label: string
  default?: unknown
  options?: { value: string; label: string }[]
}

export type PluginManagerDeps = {
  pluginService?: PluginService
  platformService?: Pick<PlatformService, 'isElectron'>
}

function createAudioOutputDescriptorRefreshKey(status: AudioOutputStatus): string {
  const settings = status.settings
  return JSON.stringify({
    enabled: status.enabled,
    backend: status.backend,
    backendAvailable: status.backendAvailable,
    requestedMode: status.requestedMode,
    activeMode: status.activeMode,
    deviceId: status.deviceId,
    devices: status.devices.map(device => [
      device.id,
      device.name,
      device.isDefault,
      device.backend
    ]),
    supportedModes: status.supportedModes ?? [],
    helperRunning: Boolean(status.helperRunning),
    testToneRunning: Boolean(status.testToneRunning),
    nativePlaybackRunning: Boolean(status.nativePlaybackRunning),
    nativePlaybackDownload: status.nativePlaybackDownload
      ? {
          state: status.nativePlaybackDownload.state,
          totalBytes: status.nativePlaybackDownload.totalBytes,
          rangeSupported: status.nativePlaybackDownload.rangeSupported,
          strategy: status.nativePlaybackDownload.strategy
        }
      : null,
    bitPerfect: status.bitPerfect ?? null,
    voicemeeterRemote: status.voicemeeterRemote
      ? {
          available: status.voicemeeterRemote.available,
          connected: status.voicemeeterRemote.connected,
          routeApplied: status.voicemeeterRemote.routeApplied,
          routeManaged: status.voicemeeterRemote.routeManaged,
          routeBus: status.voicemeeterRemote.routeBus,
          hardwareOutApplied: status.voicemeeterRemote.hardwareOutApplied,
          hardwareOutBus: status.voicemeeterRemote.hardwareOutBus,
          hardwareOutDriver: status.voicemeeterRemote.hardwareOutDriver,
          hardwareOutDevice: status.voicemeeterRemote.hardwareOutDevice,
          kind: status.voicemeeterRemote.kind,
          version: status.voicemeeterRemote.version,
          virtualInputStrip: status.voicemeeterRemote.virtualInputStrip,
          reason: status.voicemeeterRemote.reason
        }
      : null,
    reason: status.reason,
    settings: settings
      ? {
          mode: settings.mode,
          sharedDeviceId: settings.sharedDeviceId,
          deviceId: settings.deviceId,
          bufferFrames: settings.bufferFrames,
          fallbackToShared: settings.fallbackToShared,
          bitPerfectRequired: settings.bitPerfectRequired,
          voicemeeterBus: settings.voicemeeterBus,
          voicemeeterHardwareOutBus: settings.voicemeeterHardwareOutBus,
          voicemeeterHardwareOutDriver: settings.voicemeeterHardwareOutDriver,
          voicemeeterHardwareOutDevice: settings.voicemeeterHardwareOutDevice,
          diagnosticsEnabled: settings.diagnosticsEnabled
        }
      : null
  })
}

export function usePluginManager(deps: PluginManagerDeps = {}) {
  const pluginService = deps.pluginService ?? services.plugins()
  const platformService = deps.platformService ?? services.platform()

  const platforms = ref<PlatformDescriptor[]>([])
  const installPath = ref('')
  const errorMessage = ref<string | null>(null)
  const isLoading = ref(false)
  const isInstalling = ref(false)
  const busyPlatformIds = ref<string[]>([])

  const isElectron = computed(() => platformService.isElectron())
  const managedPlatforms = computed(() =>
    platforms.value.filter(
      platform => platform.source === 'builtin' || platform.source === 'external'
    )
  )
  const externalPlatforms = computed(() =>
    managedPlatforms.value.filter(platform => platform.source === 'external')
  )
  const hasPlatforms = computed(() => managedPlatforms.value.length > 0)

  const editingSettingsPlatformId = ref<string | null>(null)
  const editingSettingsValues = reactive<Record<string, unknown>>({})
  const isSavingSettings = ref(false)
  const audioOutputPlugin = useAudioOutputPlugin()
  const { playAudioOutputTestTone } = audioOutputPlugin

  let unsubscribe: (() => void) | null = null
  let runtimeRefreshRequestId = 0

  function setBusy(platformId: string, busy: boolean): void {
    const next = new Set(busyPlatformIds.value)
    if (busy) {
      next.add(platformId)
    } else {
      next.delete(platformId)
    }
    busyPlatformIds.value = Array.from(next)
  }

  async function refresh(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      platforms.value = await pluginService.refreshPlatformDescriptors()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  async function refreshRuntimePlatformDescriptors(): Promise<void> {
    if (!isElectron.value) {
      return
    }

    const requestId = ++runtimeRefreshRequestId

    try {
      const nextPlatforms = await pluginService.refreshPlatformDescriptors()
      if (requestId === runtimeRefreshRequestId) {
        platforms.value = nextPlatforms
      }
    } catch (error) {
      console.warn('[PluginManager] Failed to refresh runtime platform descriptors', error)
    }
  }

  async function install(): Promise<void> {
    if (!installPath.value.trim()) {
      errorMessage.value = '请输入插件目录、manifest.json 或 zip 包路径'
      return
    }

    isInstalling.value = true
    errorMessage.value = null

    try {
      platforms.value = await pluginService.installFromPath(installPath.value.trim())
      installPath.value = ''
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isInstalling.value = false
    }
  }

  async function browseInstallPath(mode: 'file' | 'directory' = 'file'): Promise<string | null> {
    errorMessage.value = null

    try {
      const selectedPath = await pluginService.pickInstallPath(mode)
      if (selectedPath) {
        installPath.value = selectedPath
        errorMessage.value = null
        return selectedPath
      }

      return null
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  async function toggleEnabled(platform: PlatformDescriptor): Promise<void> {
    setBusy(platform.id, true)
    errorMessage.value = null

    try {
      platforms.value = await pluginService.setEnabled(platform.id, !platform.enabled)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      setBusy(platform.id, false)
    }
  }

  async function uninstall(platform: PlatformDescriptor): Promise<void> {
    setBusy(platform.id, true)
    errorMessage.value = null

    try {
      platforms.value = await pluginService.uninstall(platform.id)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      setBusy(platform.id, false)
    }
  }

  onMounted(() => {
    void refresh()

    if (!isElectron.value) {
      return
    }

    unsubscribe = pluginService.onPlatformsChanged(nextPlatforms => {
      platforms.value = nextPlatforms
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  watch(
    () => createAudioOutputDescriptorRefreshKey(audioOutputPlugin.audioOutputStatus.value),
    () => {
      void refreshRuntimePlatformDescriptors()
    }
  )

  function getSettingsSchema(platform: PlatformDescriptor): PluginSettingDefinition[] {
    return platform.settingsSchema ?? []
  }

  function hasEditableSettings(platform: PlatformDescriptor): boolean {
    return (platform.settingsSchema?.length ?? 0) > 0
  }

  function startEditingSettings(platform: PlatformDescriptor): void {
    editingSettingsPlatformId.value = platform.id
    Object.keys(editingSettingsValues).forEach(key => delete editingSettingsValues[key])

    for (const definition of platform.settingsSchema ?? []) {
      editingSettingsValues[definition.key] = definition.default
    }

    void loadCurrentSettings(platform.id)
  }

  function cancelEditingSettings(): void {
    editingSettingsPlatformId.value = null
    Object.keys(editingSettingsValues).forEach(key => delete editingSettingsValues[key])
  }

  async function loadCurrentSettings(platformId: string): Promise<void> {
    try {
      const current = await pluginService.getSettings(platformId)
      for (const [key, value] of Object.entries(current)) {
        editingSettingsValues[key] = value
      }
    } catch {
      // use defaults
    }
  }

  async function saveSettings(): Promise<void> {
    const platformId = editingSettingsPlatformId.value
    if (!platformId) {
      return
    }

    isSavingSettings.value = true
    errorMessage.value = null

    try {
      await pluginService.updateSettings(platformId, { ...editingSettingsValues })
      editingSettingsPlatformId.value = null
      Object.keys(editingSettingsValues).forEach(key => delete editingSettingsValues[key])
      platforms.value = await pluginService.refreshPlatformDescriptors()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isSavingSettings.value = false
    }
  }

  async function testAudioOutput(platform: PlatformDescriptor): Promise<void> {
    if (platform.id !== AUDIO_OUTPUT_PLUGIN_ID) {
      return
    }

    setBusy(platform.id, true)
    errorMessage.value = null

    try {
      const status = await playAudioOutputTestTone()
      if (!status.enabled || status.backend !== 'native' || !status.backendAvailable) {
        errorMessage.value = status.reason ?? '原生音频输出测试失败'
        return
      }
      platforms.value = await pluginService.refreshPlatformDescriptors()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      setBusy(platform.id, false)
    }
  }

  return {
    installPath,
    platforms,
    managedPlatforms,
    externalPlatforms,
    hasPlatforms,
    isElectron,
    isLoading,
    isInstalling,
    busyPlatformIds,
    errorMessage,
    editingSettingsPlatformId,
    editingSettingsValues,
    isSavingSettings,
    refresh,
    install,
    browseInstallPath,
    toggleEnabled,
    uninstall,
    getSettingsSchema,
    hasEditableSettings,
    startEditingSettings,
    cancelEditingSettings,
    saveSettings,
    testAudioOutput
  }
}
