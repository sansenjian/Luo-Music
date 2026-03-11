import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pathJoinMock = vi.fn((...segments: string[]) => segments.join('/'))

vi.mock('node:path', () => ({
  default: {
    join: pathJoinMock,
    resolve: (...segments: string[]) => segments.join('/'),
    dirname: (input: string) => input
  }
}))

describe('electron/utils/paths', () => {
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.argv = [...originalArgv]
    delete process.env.APP_ROOT
    delete process.env.VITE_PUBLIC
    delete process.env.NODE_ENV
    process.argv[1] = 'argv-entry.js'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.argv = [...originalArgv]
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
})
