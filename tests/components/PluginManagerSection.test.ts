import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref, type Ref } from 'vue'

type PluginManagerTestState = {
  installPath: Ref<string>
  managedPlatforms: Ref<unknown[]>
  hasPlatforms: Ref<boolean>
  isElectron: Ref<boolean>
  isLoading: Ref<boolean>
  isInstalling: Ref<boolean>
  busyPlatformIds: Ref<string[]>
  errorMessage: Ref<string | null>
  editingSettingsPlatformId: Ref<string | null>
  editingSettingsValues: Record<string, unknown>
  isSavingSettings: Ref<boolean>
  refresh: ReturnType<typeof vi.fn<() => Promise<void>>>
  install: ReturnType<typeof vi.fn<() => Promise<void>>>
  browseInstallPath: ReturnType<
    typeof vi.fn<(mode?: 'file' | 'directory') => Promise<string | null>>
  >
  toggleEnabled: ReturnType<typeof vi.fn<(platform: unknown) => Promise<void>>>
  uninstall: ReturnType<typeof vi.fn<(platform: unknown) => Promise<void>>>
  getSettingsSchema: ReturnType<typeof vi.fn<(platform: unknown) => never[]>>
  hasEditableSettings: ReturnType<typeof vi.fn<(platform: unknown) => boolean>>
  startEditingSettings: ReturnType<typeof vi.fn<(platform: unknown) => void>>
  cancelEditingSettings: ReturnType<typeof vi.fn<() => void>>
  saveSettings: ReturnType<typeof vi.fn<() => Promise<void>>>
}

const pluginManagerMock = vi.hoisted((): { current: PluginManagerTestState | null } => ({
  current: null
}))

vi.mock('@/composables/usePluginManager', () => ({
  usePluginManager: () => {
    if (!pluginManagerMock.current) {
      throw new Error('Missing plugin manager test state')
    }

    return pluginManagerMock.current
  }
}))

describe('PluginManagerSection.vue', () => {
  let pluginManager: PluginManagerTestState
  let mountedWrappers: VueWrapper[] = []

  beforeEach(() => {
    pluginManager = createPluginManagerState()
    pluginManagerMock.current = pluginManager
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers) {
      wrapper.unmount()
    }

    mountedWrappers = []
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('opens a confirmation modal before installing a plugin', async () => {
    const wrapper = await mountSection()

    await getWrapperButtonByText(wrapper, '安装插件').trigger('click')

    expect(pluginManager.install).not.toHaveBeenCalled()
    expect(document.body.querySelector('.plugin-install-modal')).not.toBeNull()
    expect(document.body.textContent).toContain('确认安装插件')
    expect(document.body.textContent).toContain('C:\\plugins\\demo.zip')

    getDocumentButtonByText('确认安装').click()
    await flushPromises()

    expect(pluginManager.install).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.plugin-install-modal')).toBeNull()
  })

  it('opens the confirmation modal immediately after browsing a plugin path', async () => {
    const wrapper = await mountSection()

    await getWrapperButtonByText(wrapper, '选择 zip').trigger('click')
    await flushPromises()

    expect(pluginManager.browseInstallPath).toHaveBeenCalledWith('file')
    expect(pluginManager.install).not.toHaveBeenCalled()
    expect(document.body.querySelector('.plugin-install-modal')).not.toBeNull()
    expect(document.body.textContent).toContain('C:\\plugins\\demo.zip')
  })

  it('closes the install confirmation without calling install when cancelled', async () => {
    const wrapper = await mountSection()

    await getWrapperButtonByText(wrapper, '安装插件').trigger('click')
    getDocumentButtonByText('取消').click()
    await flushPromises()

    expect(pluginManager.install).not.toHaveBeenCalled()
    expect(document.body.querySelector('.plugin-install-modal')).toBeNull()
  })

  it('keeps install unavailable when no plugin path has been entered', async () => {
    pluginManager.installPath.value = '   '
    const wrapper = await mountSection()
    const installButton = getWrapperButtonByText(wrapper, '安装插件')

    expect((installButton.element as HTMLButtonElement).disabled).toBe(true)
    await installButton.trigger('click')

    expect(pluginManager.install).not.toHaveBeenCalled()
    expect(document.body.querySelector('.plugin-install-modal')).toBeNull()
  })

  async function mountSection(): Promise<VueWrapper> {
    const { default: PluginManagerSection } =
      await import('@/components/settings/PluginManagerSection.vue')
    const wrapper = mount(PluginManagerSection, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: true
        }
      }
    })
    mountedWrappers.push(wrapper)
    return wrapper
  }
})

function createPluginManagerState(): PluginManagerTestState {
  return {
    installPath: ref('C:\\plugins\\demo.zip'),
    managedPlatforms: ref([]),
    hasPlatforms: ref(false),
    isElectron: ref(true),
    isLoading: ref(false),
    isInstalling: ref(false),
    busyPlatformIds: ref([]),
    errorMessage: ref(null),
    editingSettingsPlatformId: ref(null),
    editingSettingsValues: reactive({}),
    isSavingSettings: ref(false),
    refresh: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    install: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    browseInstallPath: vi.fn<(mode?: 'file' | 'directory') => Promise<string | null>>(() =>
      Promise.resolve('C:\\plugins\\demo.zip')
    ),
    toggleEnabled: vi.fn<(platform: unknown) => Promise<void>>(() => Promise.resolve()),
    uninstall: vi.fn<(platform: unknown) => Promise<void>>(() => Promise.resolve()),
    getSettingsSchema: vi.fn<(platform: unknown) => never[]>(() => []),
    hasEditableSettings: vi.fn<(platform: unknown) => boolean>(() => false),
    startEditingSettings: vi.fn<(platform: unknown) => void>(),
    cancelEditingSettings: vi.fn<() => void>(),
    saveSettings: vi.fn<() => Promise<void>>(() => Promise.resolve())
  }
}

function getWrapperButtonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll('button').find(candidate => candidate.text().includes(text))
  if (!button) {
    throw new Error(`Unable to find wrapper button containing "${text}"`)
  }

  return button
}

function getDocumentButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(candidate =>
    candidate.textContent?.includes(text)
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find document button containing "${text}"`)
  }

  return button
}
