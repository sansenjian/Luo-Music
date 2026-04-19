import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomeShell } from '@/composables/useHomeShell'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { mountComposable } from '../helpers/mountComposable'

const platformServiceMock = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  isElectron: vi.fn(() => false),
  isMobile: vi.fn(() => false),
  maximizeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  on: vi.fn(() => vi.fn())
}))

const storageServiceMock = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => string | null>(() => null),
  getJSON: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
  setJSON: vi.fn()
}))

const useKeyboardShortcutsMock = vi.hoisted(() => vi.fn())

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock,
      storage: () => storageServiceMock
    }
  }
})

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: useKeyboardShortcutsMock
}))

function mountShell() {
  const mounted = mountComposable(() => useHomeShell())

  return {
    ...mounted,
    vm: mounted.wrapper.vm as unknown as ReturnType<typeof useHomeShell>
  }
}

describe('useHomeShell', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    platformServiceMock.isElectron.mockReturnValue(false)
    platformServiceMock.isMobile.mockReturnValue(false)
    storageServiceMock.getItem.mockReturnValue(null)
  })

  it('initializes keyboard shortcuts and exposes shell actions', () => {
    const { vm } = mountShell()

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

    const { vm } = mountShell()

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

    const { vm } = mountShell()

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

  it('enables the docked player mode before first paint on mobile without user preference', () => {
    platformServiceMock.isMobile.mockReturnValue(true)

    const playerStore = usePlayerStore()
    playerStore.isPlayerDocked = false

    mountShell()

    expect(playerStore.isPlayerDocked).toBe(true)
    expect(storageServiceMock.setItem).toHaveBeenCalledWith('playerDockedUserToggled', 'true')
  })

  it('does not force the docked player mode after the user has already chosen a preference', () => {
    platformServiceMock.isMobile.mockReturnValue(true)
    storageServiceMock.getItem.mockReturnValue('1')

    const playerStore = usePlayerStore()
    playerStore.isPlayerDocked = false

    mountShell()

    expect(playerStore.isPlayerDocked).toBe(false)
    expect(storageServiceMock.setItem).not.toHaveBeenCalled()
  })
})
