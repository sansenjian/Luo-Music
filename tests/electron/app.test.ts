import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PathLike } from 'node:fs'

const setPathMock = vi.fn()
const setAppUserModelIdMock = vi.fn()
const setNameMock = vi.fn()
let mockIsPackaged = false
let mockProcessExecPath = 'C:/Program Files/LUO Music/LUO Music.exe'
const existsSyncMock = vi.fn((_path: PathLike) => false)

type StartMenuShortcutPayload = {
  appUserModelId: string
  arguments: string
  shortcutPath: string
  targetPath: string
  workingDirectory: string
}

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged
    },
    set isPackaged(value: boolean) {
      mockIsPackaged = value
    },
    setPath: setPathMock,
    setAppUserModelId: setAppUserModelIdMock,
    setName: setNameMock,
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn(),
    getVersion: vi.fn(() => '1.0.0')
  }
}))

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  default: {
    existsSync: existsSyncMock
  }
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        optionsOrCallback: unknown,
        maybeCallback?: (error: null) => void
      ) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
        callback?.(null)
      }
    )
  }
})

vi.mock('node:path', async importOriginal => {
  const actual = await importOriginal<typeof import('node:path')>()
  return {
    ...actual,
    default: actual
  }
})

vi.mock('../../electron/utils/paths', () => ({
  PROJECT_ROOT: '/mock/root'
}))

describe('electron/main/app', () => {
  let appModule: typeof import('../../electron/main/app')
  let childProcess: typeof import('node:child_process')

  beforeAll(async () => {
    appModule = await import('../../electron/main/app')
    childProcess = await import('node:child_process')
  })

  beforeEach(() => {
    setPathMock.mockClear()
    setAppUserModelIdMock.mockClear()
    setNameMock.mockClear()
    vi.mocked(childProcess.execFile).mockClear()
    existsSyncMock.mockReset()
    existsSyncMock.mockReturnValue(false)
    mockIsPackaged = false
    mockProcessExecPath = 'C:/Program Files/LUO Music/LUO Music.exe'
    originalAppData = process.env.APPDATA
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'
  })

  afterEach(() => {
    if (originalAppData === undefined) {
      delete process.env.APPDATA
    } else {
      process.env.APPDATA = originalAppData
    }
  })

  it('sets dev userData path when not packaged', () => {
    mockIsPackaged = false

    appModule.setupDevUserData()

    expect(setPathMock).toHaveBeenCalledWith(
      'userData',
      expect.stringMatching(/[\\/]mock[\\/]root[\\/]\.userData/)
    )
  })

  it('does not set userData path when packaged', () => {
    mockIsPackaged = true

    appModule.setupDevUserData()

    expect(setPathMock).not.toHaveBeenCalled()
  })

  it('sets the display name before setting the AppUserModelId', () => {
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    expect(setNameMock).toHaveBeenCalledWith('LUO Music')
    expect(setNameMock.mock.invocationCallOrder[0]).toBeLessThan(
      setAppUserModelIdMock.mock.invocationCallOrder[0]
    )

    restorePlatform()
  })

  it('uses the fixed AppUserModelId in development mode', () => {
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    expect(setAppUserModelIdMock).toHaveBeenCalledWith('com.sansenjian.luo-music')

    restorePlatform()
  })

  it('uses the fixed AppUserModelId which has a registered DisplayName', () => {
    // The AppUserModelId must be consistent across dev and production so
    // that the registry entry written by registerAppUserModelIdDisplayName
    // actually matches.  In development we no longer use process.execPath.
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    // Both dev and packaged modes should use the same fixed ID
    expect(setAppUserModelIdMock).toHaveBeenCalledWith('com.sansenjian.luo-music')

    restorePlatform()
  })

  it('uses the Squirrel AppUserModelId when running from a Squirrel-installed package', () => {
    mockIsPackaged = true
    mockProcessExecPath = 'C:/Users/test/AppData/Local/LUO_Music/app-1.0.0/LUO Music.exe'
    existsSyncMock.mockReturnValue(true)
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    expect(setAppUserModelIdMock).toHaveBeenCalledWith('com.squirrel.LUO_Music.LUO Music')

    restorePlatform()
  })

  it('uses the stable packaged AppUserModelId outside Squirrel packaging', () => {
    mockIsPackaged = true
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    expect(setAppUserModelIdMock).toHaveBeenCalledWith('com.sansenjian.luo-music')

    restorePlatform()
  })

  it('registers a Start Menu shortcut with the AppUserModelId for Windows shell lookup', () => {
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    const { payload, script } = readStartMenuShortcutPayload(childProcess)

    expect(script).toContain('System.AppUserModel.ID')
    expect(script).toContain('9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3')
    expect(payload.shortcutPath).toMatch(/LUO Music\.lnk$/)
    expect(payload.appUserModelId).toBe('com.sansenjian.luo-music')

    restorePlatform()
  })

  it('points Squirrel Start Menu shortcuts at Update.exe for update-safe launches', () => {
    mockIsPackaged = true
    mockProcessExecPath = 'C:/Users/test/AppData/Local/LUO_Music/app-1.0.0/LUO Music.exe'
    existsSyncMock.mockImplementation(candidate =>
      String(candidate).replace(/\\/g, '/').endsWith('/LUO_Music/Update.exe')
    )
    mockPlatform('win32', mockProcessExecPath)

    appModule.setupWindowsShellIntegration()

    const { payload } = readStartMenuShortcutPayload(childProcess)

    expect(payload.appUserModelId).toBe('com.squirrel.LUO_Music.LUO Music')
    expect(payload.arguments).toBe('--processStart "LUO Music.exe"')
    expect(payload.targetPath.replace(/\\/g, '/')).toMatch(/\/LUO_Music\/Update\.exe$/)
    expect(payload.workingDirectory.replace(/\\/g, '/')).toMatch(/\/LUO_Music$/)

    restorePlatform()
  })
})

let _originalPlatform: string | undefined
let _originalExecPath: string | undefined
let originalAppData: string | undefined

function mockPlatform(platform: string, execPath: string): void {
  _originalPlatform = process.platform
  _originalExecPath = process.execPath
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  Object.defineProperty(process, 'execPath', { value: execPath, configurable: true })
}

function restorePlatform(): void {
  if (_originalPlatform !== undefined) {
    Object.defineProperty(process, 'platform', { value: _originalPlatform, configurable: true })
  }
  if (_originalExecPath !== undefined) {
    Object.defineProperty(process, 'execPath', { value: _originalExecPath, configurable: true })
  }
}

function readStartMenuShortcutPayload(childProcess: typeof import('node:child_process')): {
  payload: StartMenuShortcutPayload
  script: string
} {
  const powershellCall = vi
    .mocked(childProcess.execFile)
    .mock.calls.find(([command]) => command === 'powershell.exe')
  expect(powershellCall).toBeDefined()
  expect(powershellCall?.[2]).toMatchObject({ windowsHide: true })

  const args = powershellCall?.[1] as string[]
  const encodedCommand = args.at(args.indexOf('-EncodedCommand') + 1)
  expect(encodedCommand).toBeDefined()

  const script = Buffer.from(encodedCommand ?? '', 'base64').toString('utf16le')
  const payloadBase64 = script.match(/FromBase64String\('([^']+)'\)/)?.[1] ?? ''
  const payload = JSON.parse(
    Buffer.from(payloadBase64, 'base64').toString('utf8')
  ) as StartMenuShortcutPayload

  return { payload, script }
}
