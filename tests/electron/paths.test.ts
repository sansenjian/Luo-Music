import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pathJoinMock = vi.fn((...segments: string[]) => segments.join('/'))

vi.mock('node:path', () => ({
  default: {
    join: pathJoinMock,
    resolve: (...segments: string[]) => segments.join('/'),
    dirname: (input: string) => input
  }
}))

function setResourcesPath(value: string | undefined): void {
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

describe('electron/utils/paths', () => {
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]
  const originalResourcesPath = process.resourcesPath

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.argv = [...originalArgv]
    delete process.env.APP_ROOT
    delete process.env.VITE_PUBLIC
    delete process.env.NODE_ENV
    process.argv[1] = 'argv-entry.js'
    setResourcesPath(originalResourcesPath)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.argv = [...originalArgv]
    setResourcesPath(originalResourcesPath)
  })

  it('应该正确导出 BUILD_DIR、MAIN_DIST 和 RENDERER_DIST', async () => {
    const paths = await import('../../electron/utils/paths')

    expect(paths.BUILD_DIR).toBeDefined()
    expect(paths.MAIN_DIST).toBeDefined()
    expect(paths.RENDERER_DIST).toBeDefined()
    expect(paths.__dirname).toBeDefined()
    expect(paths.__filename).toBeDefined()
  })

  it('VITE_PUBLIC 应该使用环境变量或默认值', async () => {
    process.env.VITE_PUBLIC = 'custom-public'
    const paths = await import('../../electron/utils/paths')

    expect(paths.VITE_PUBLIC).toBe('custom-public')
  })

  it('VITE_PUBLIC 未设置时应该使用默认 public 路径', async () => {
    delete process.env.VITE_PUBLIC
    const paths = await import('../../electron/utils/paths')

    expect(paths.VITE_PUBLIC).toBeDefined()
  })

  it('开发环境按脚本类型解析 dev 和 runtime 目录', async () => {
    process.env.APP_ROOT = '/mock/project'
    setResourcesPath(undefined)

    const paths = await import('../../electron/utils/paths')

    expect(paths.getScriptPath('qq-api-server.cjs')).toBe(
      '/mock/project/scripts/dev/qq-api-server.cjs'
    )
    expect(paths.getScriptPath('netease-api-server.cjs')).toBe(
      '/mock/project/scripts/runtime/netease-api-server.cjs'
    )
  })

  it('打包环境应从 resources 下的 app.asar 解析构建目录', async () => {
    setResourcesPath('/mock/resources')

    const paths = await import('../../electron/utils/paths')

    expect(paths.PROJECT_ROOT).toBe('/mock/resources/app.asar')
    expect(paths.BUILD_DIR).toBe('/mock/resources/app.asar/build')
    expect(paths.MAIN_DIST).toBe('/mock/resources/app.asar/build/electron')
    expect(paths.RENDERER_DIST).toBe('/mock/resources/app.asar/build')
    // 打包后脚本位于 resources/ 根目录下（extraResource 直接复制到根目录）
    expect(paths.getScriptPath('qq-api-server.cjs')).toBe('/mock/resources/qq-api-server.cjs')
  })
})

describe('electron/main/audioOutputNativePaths', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('maps helper filenames per platform', async () => {
    const paths = await import('../../electron/main/audioOutputNativePaths')

    expect(paths.getAudioOutputHelperFileName('win32')).toBe('audio-output-helper.exe')
    expect(paths.getAudioOutputHelperFileName('darwin')).toBe('audio-output-helper')
    expect(paths.getAudioOutputHelperFileName('linux')).toBe('audio-output-helper')
  })

  it('resolves the first existing helper candidate for a non-Windows desktop build', async () => {
    const paths = await import('../../electron/main/audioOutputNativePaths')
    const seen: string[] = []

    const resolved = paths.resolveAudioOutputHelperPath({
      appPath: '/mock/app',
      exists: candidate => {
        seen.push(candidate)
        return candidate.endsWith('/build/native/audio-output-helper')
      },
      platform: 'linux',
      resourcesPath: '/mock/resources'
    })

    expect(resolved).toBe('/mock/app/build/native/audio-output-helper')
    expect(seen).toEqual([
      '/mock/app/native/audio-engine/target/debug/audio-output-helper',
      '/mock/app/build/native/audio-output-helper'
    ])
  })

  it('resolves packaged helper paths per platform', async () => {
    const paths = await import('../../electron/main/audioOutputNativePaths')

    expect(
      paths.resolveAudioOutputHelperPath({
        appPath: '/mock/app',
        exists: candidate => candidate === '/mock/resources/native/audio-output-helper.exe',
        isPackaged: true,
        platform: 'win32',
        resourcesPath: '/mock/resources'
      })
    ).toBe('/mock/resources/native/audio-output-helper.exe')

    for (const platform of ['darwin', 'linux'] as const) {
      expect(
        paths.resolveAudioOutputHelperPath({
          appPath: '/mock/app',
          exists: candidate => candidate === '/mock/resources/native/audio-output-helper',
          isPackaged: true,
          platform,
          resourcesPath: '/mock/resources'
        })
      ).toBe('/mock/resources/native/audio-output-helper')
    }
  })
})
