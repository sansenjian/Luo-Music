import { beforeEach, describe, expect, it, vi } from 'vitest'

const appendSwitchMock = vi.hoisted(() => vi.fn())
const electronStoreGetMock = vi.hoisted(() =>
  vi.fn((key: string, defaultValue?: unknown) => defaultValue)
)
const electronStoreSetMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    commandLine: {
      appendSwitch: appendSwitchMock
    }
  }
}))

vi.mock('electron-store', () => ({
  default: class {
    get<T>(key: string, defaultValue?: T): T {
      return electronStoreGetMock(key, defaultValue) as T
    }

    set(key: string, value: unknown): void {
      electronStoreSetMock(key, value)
    }
  }
}))

describe('electron/main/smtc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables Chromium media features for a disabled persisted SMTC setting', async () => {
    const { configureSmtcCommandLineForState, isSmtcCommandLineEnabled } =
      await import('../../electron/main/smtc')

    expect(
      configureSmtcCommandLineForState({
        smtcEnabled: false,
        waveformEnabled: false,
        coverSwipeEnabled: false
      })
    ).toBe(false)
    expect(isSmtcCommandLineEnabled()).toBe(false)
    expect(appendSwitchMock).toHaveBeenCalledWith(
      'disable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    )
  })

  it('enables Chromium media features for an enabled persisted SMTC setting', async () => {
    const { configureSmtcCommandLineForState, isSmtcCommandLineEnabled } =
      await import('../../electron/main/smtc')

    expect(
      configureSmtcCommandLineForState({
        smtcEnabled: true,
        waveformEnabled: false,
        coverSwipeEnabled: false
      })
    ).toBe(true)
    expect(isSmtcCommandLineEnabled()).toBe(true)
    expect(appendSwitchMock).toHaveBeenCalledWith(
      'enable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    )
  })
})
