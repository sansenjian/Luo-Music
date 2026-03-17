import { beforeEach, describe, expect, it, vi } from 'vitest'

const setPathMock = vi.fn()
let mockIsPackaged = false

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged
    },
    set isPackaged(value: boolean) {
      mockIsPackaged = value
    },
    setPath: setPathMock,
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn(),
    getVersion: vi.fn(() => '1.0.0')
  }
}))

vi.mock('node:path', () => ({
  default: {
    join: (...segments: string[]) => segments.join('/')
  }
}))

vi.mock('../../electron/utils/paths', () => ({
  PROJECT_ROOT: '/mock/root'
}))

describe('electron/main/app', () => {
  beforeEach(() => {
    vi.resetModules()
    setPathMock.mockClear()
    mockIsPackaged = false
  })

  it('sets dev userData path when not packaged', async () => {
    mockIsPackaged = false

    const { setupDevUserData } = await import('../../electron/main/app')
    setupDevUserData()

    expect(setPathMock).toHaveBeenCalledWith(
      'userData',
      expect.stringMatching(/[\\/]mock[\\/]root[\\/]\.userData/)
    )
  })

  it('does not set userData path when packaged', async () => {
    mockIsPackaged = true

    const { setupDevUserData } = await import('../../electron/main/app')
    setupDevUserData()

    expect(setPathMock).not.toHaveBeenCalled()
  })
})
