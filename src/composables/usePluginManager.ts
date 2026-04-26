import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { PlatformDescriptor } from '@/platform/music/descriptors'
import { services } from '@/services'
import type { PluginService } from '@/services/pluginService'
import type { PlatformService } from '@/services/platformService'

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

  let unsubscribe: (() => void) | null = null

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
    if (!isElectron.value) {
      platforms.value = []
      return
    }

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

  async function install(): Promise<void> {
    if (!installPath.value.trim()) {
      errorMessage.value = '请输入插件目录或 manifest.json 路径'
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

  async function browseInstallPath(): Promise<void> {
    try {
      const selectedPath = await pluginService.pickInstallPath()
      if (selectedPath) {
        installPath.value = selectedPath
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
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
    if (!isElectron.value) {
      return
    }

    void refresh()
    unsubscribe = pluginService.onPlatformsChanged(nextPlatforms => {
      platforms.value = nextPlatforms
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
  })

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
    saveSettings
  }
}
