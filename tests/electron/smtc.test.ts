import { beforeEach, describe, expect, it, vi } from 'vitest'

const appendSwitchMock = vi.hoisted(() => vi.fn())
const appGetAppPathMock = vi.hoisted(() => vi.fn(() => 'D:\\app'))
const electronStoreGetMock = vi.hoisted(() =>
  vi.fn((key: string, defaultValue?: unknown) => defaultValue)
)
const electronStoreSetMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getAppPath: appGetAppPathMock,
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
    vi.resetModules()
    vi.clearAllMocks()
    appGetAppPathMock.mockReturnValue('D:\\app')
    vi.doUnmock('../../electron/main/smtcNativePaths')
  })

  it('disables Chromium media features for a disabled persisted SMTC setting', async () => {
    const { configureSmtcCommandLineForState, isSmtcCommandLineEnabled } =
      await import('../../electron/main/smtc')

    expect(
      configureSmtcCommandLineForState(
        {
          smtcEnabled: false,
          waveformEnabled: false,
          coverSwipeEnabled: false
        },
        { nativeHelperAvailable: false }
      )
    ).toBe(false)
    expect(isSmtcCommandLineEnabled()).toBe(false)
    expect(appendSwitchMock).toHaveBeenCalledWith(
      'disable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    )
  })

  it('enables Chromium media features for an enabled SMTC setting when native helper is unavailable', async () => {
    const { configureSmtcCommandLineForState, isSmtcCommandLineEnabled } =
      await import('../../electron/main/smtc')

    expect(
      configureSmtcCommandLineForState(
        {
          smtcEnabled: true,
          waveformEnabled: false,
          coverSwipeEnabled: false
        },
        { nativeHelperAvailable: false }
      )
    ).toBe(true)
    expect(isSmtcCommandLineEnabled()).toBe(true)
    expect(appendSwitchMock).toHaveBeenCalledWith(
      'enable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    )
  })

  it('disables Chromium media features for an enabled SMTC setting when native helper is available', async () => {
    const { configureSmtcCommandLineForState, isSmtcCommandLineEnabled } =
      await import('../../electron/main/smtc')

    expect(
      configureSmtcCommandLineForState(
        {
          smtcEnabled: true,
          waveformEnabled: false,
          coverSwipeEnabled: false
        },
        { nativeHelperAvailable: true }
      )
    ).toBe(false)
    expect(isSmtcCommandLineEnabled()).toBe(false)
    expect(appendSwitchMock).toHaveBeenCalledWith(
      'disable-features',
      'HardwareMediaKeyHandling,MediaSessionService'
    )
  })

  it('signals restart when runtime SMTC toggle differs from startup command-line state', async () => {
    const { configureSmtcCommandLineForState, setSmtcEnabledFromRenderer } =
      await import('../../electron/main/smtc')

    configureSmtcCommandLineForState(
      {
        smtcEnabled: false,
        waveformEnabled: false,
        coverSwipeEnabled: false
      },
      { nativeHelperAvailable: false }
    )

    expect(setSmtcEnabledFromRenderer(true)).toEqual({ restartRequired: true })
    expect(electronStoreSetMock).toHaveBeenCalledWith('experimentalFeatures', {
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
  })

  it('does not signal restart when runtime SMTC toggle matches startup command-line state', async () => {
    const { configureSmtcCommandLineForState, setSmtcEnabledFromRenderer } =
      await import('../../electron/main/smtc')

    configureSmtcCommandLineForState(
      {
        smtcEnabled: true,
        waveformEnabled: false,
        coverSwipeEnabled: false
      },
      { nativeHelperAvailable: false }
    )

    expect(setSmtcEnabledFromRenderer(true)).toEqual({ restartRequired: false })
  })

  it('probes the native helper from the stable Electron app path at startup', async () => {
    const resolveSmtcHelperPathMock = vi.fn(() => null)
    vi.doMock('../../electron/main/smtcNativePaths', () => ({
      resolveSmtcHelperPath: resolveSmtcHelperPathMock
    }))
    electronStoreGetMock.mockReturnValue({
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })

    const { configureSmtcCommandLine } = await import('../../electron/main/smtc')

    configureSmtcCommandLine()

    expect(resolveSmtcHelperPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appPath: 'D:\\app',
        isPackaged: undefined
      })
    )
  })
})
