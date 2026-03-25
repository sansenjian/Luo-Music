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
