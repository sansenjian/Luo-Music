import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useHomeShell } from '../../src/composables/useHomeShell'
import { usePlayerStore } from '../../src/store/playerStore'
import { useToastStore } from '../../src/store/toastStore'

const platformServiceMock = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  isElectron: vi.fn(() => false),
  isMobile: vi.fn(() => false),
  maximizeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  on: vi.fn(() => vi.fn())
}))

const storageServiceMock = vi.hoisted(() => ({
  getItem: vi.fn(() => null),
  getJSON: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
  setJSON: vi.fn()
}))

const useKeyboardShortcutsMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/services', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock,
      storage: () => storageServiceMock
    }
  }
})

vi.mock('../../src/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: useKeyboardShortcutsMock
}))

function mountShell() {
  const Harness = defineComponent({
    setup() {
      return useHomeShell()
    },
    template: '<div />'
  })

  return mount(Harness)
}

describe('useHomeShell', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    platformServiceMock.isElectron.mockReturnValue(false)
    platformServiceMock.isMobile.mockReturnValue(false)
    storageServiceMock.getItem.mockReturnValue(null)
  })

  it('initializes keyboard shortcuts and exposes shell actions', () => {
    const wrapper = mountShell()
    const vm = wrapper.vm as unknown as ReturnType<typeof useHomeShell>

    expect(useKeyboardShortcutsMock).toHaveBeenCalledTimes(1)
    expect(vm.activeTab).toBe('lyric')

    vm.switchTab('playlist')
    expect(vm.activeTab).toBe('playlist')

    vm.minimizeWindow()
    vm.maximizeWindow()
    vm.closeWindow()

    expect(platformServiceMock.minimizeWindow).toHaveBeenCalledTimes(1)
    expect(platformServiceMock.maximizeWindow).toHaveBeenCalledTimes(1)
    expect(platformServiceMock.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('switches back to lyric tab after a successful play request', async () => {
    const playerStore = usePlayerStore()
    const playSongWithDetails = vi
      .spyOn(playerStore, 'playSongWithDetails')
      .mockResolvedValue(undefined as never)

    const wrapper = mountShell()
    const vm = wrapper.vm as unknown as ReturnType<typeof useHomeShell>

    vm.switchTab('playlist')
    await vm.playSong(2)

    expect(playSongWithDetails).toHaveBeenCalledWith(2)
    expect(vm.activeTab).toBe('lyric')
  })

  it('reports playback failures through the toast store', async () => {
    const playerStore = usePlayerStore()
    vi.spyOn(playerStore, 'playSongWithDetails').mockRejectedValue(new Error('boom'))

    const toastStore = useToastStore()
    const error = vi.spyOn(toastStore, 'error').mockImplementation(() => {})

    const wrapper = mountShell()
    const vm = wrapper.vm as unknown as ReturnType<typeof useHomeShell>

    await vm.playSong(1)

    expect(error).toHaveBeenCalledWith('boom')
    expect(vm.activeTab).toBe('lyric')
  })

  it('sets up ipc listeners on mount in Electron', async () => {
    platformServiceMock.isElectron.mockReturnValue(true)

    const playerStore = usePlayerStore()
    const setupIpcListeners = vi
      .spyOn(playerStore, 'setupIpcListeners')
      .mockImplementation(() => {})

    mountShell()
    await nextTick()

    expect(setupIpcListeners).toHaveBeenCalledTimes(1)
  })

  it('enables compact mode on first mobile mount without user preference', async () => {
    platformServiceMock.isMobile.mockReturnValue(true)

    const playerStore = usePlayerStore()
    playerStore.isCompact = false
    const toggleCompactMode = vi
      .spyOn(playerStore, 'toggleCompactMode')
      .mockImplementation(() => {})

    mountShell()
    await nextTick()

    expect(toggleCompactMode).toHaveBeenCalledTimes(1)
  })

  it('does not force compact mode after the user has already chosen a preference', async () => {
    platformServiceMock.isMobile.mockReturnValue(true)
    storageServiceMock.getItem.mockReturnValue('1')

    const playerStore = usePlayerStore()
    playerStore.isCompact = false
    const toggleCompactMode = vi
      .spyOn(playerStore, 'toggleCompactMode')
      .mockImplementation(() => {})

    mountShell()
    await nextTick()

    expect(toggleCompactMode).not.toHaveBeenCalled()
  })
})
