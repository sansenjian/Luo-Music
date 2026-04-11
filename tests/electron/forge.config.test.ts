import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function loadForgeModule(fastMakeMode?: string) {
  const previousFastMakeMode = process.env.LUO_FAST_MAKE

  if (fastMakeMode === undefined) {
    delete process.env.LUO_FAST_MAKE
  } else {
    process.env.LUO_FAST_MAKE = fastMakeMode
  }

  vi.resetModules()

  try {
    return await import('../../forge.config')
  } finally {
    if (previousFastMakeMode === undefined) {
      delete process.env.LUO_FAST_MAKE
    } else {
      process.env.LUO_FAST_MAKE = previousFastMakeMode
    }
  }
}

async function loadForgeConfig(fastMakeMode?: string) {
  return (await loadForgeModule(fastMakeMode)).default
}

let config: Awaited<ReturnType<typeof loadForgeConfig>>

beforeEach(async () => {
  config = await loadForgeConfig()
})

function matchesIgnore(relativePath: string): boolean {
  const ignorePatterns = config.packagerConfig?.ignore

  expect(Array.isArray(ignorePatterns)).toBe(true)

  return (ignorePatterns as Array<string | RegExp>).some(pattern =>
    typeof pattern === 'string' ? relativePath.includes(pattern) : pattern.test(relativePath)
  )
}

function getMakerName(maker: unknown): string | undefined {
  if (!maker || typeof maker !== 'object') {
    return undefined
  }

  const namedMaker = maker as { name?: unknown }
  return typeof namedMaker.name === 'string' ? namedMaker.name : undefined
}

function getExtraResources(): string[] {
  const extraResources = config.packagerConfig?.extraResource

  expect(Array.isArray(extraResources)).toBe(true)

  return [...(extraResources as string[])]
}

type PackagerHook = (
  buildPath: string,
  electronVersion: string,
  platform: string,
  arch: string,
  callback: (error?: Error | null) => void
) => void

function getAfterExtractHooks(): PackagerHook[] {
  const afterExtract = config.packagerConfig?.afterExtract

  expect(Array.isArray(afterExtract)).toBe(true)

  return [...(afterExtract as PackagerHook[])]
}

function getAfterCopyHooks(): PackagerHook[] {
  const afterCopy = config.packagerConfig?.afterCopy

  expect(Array.isArray(afterCopy)).toBe(true)

  return [...(afterCopy as PackagerHook[])]
}

function getAfterPruneHooks(): PackagerHook[] {
  const afterPrune = config.packagerConfig?.afterPrune

  expect(Array.isArray(afterPrune)).toBe(true)

  return [...(afterPrune as PackagerHook[])]
}

async function runPackagerHook(hook: PackagerHook, buildPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    hook(buildPath, '40.8.5', 'win32', 'x64', error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

describe('forge.config packagerConfig.ignore', () => {
  it('ignores development-only roots, scripts, sourcemaps, and dependency metadata', () => {
    expect(matchesIgnore('/.ai/session.json')).toBe(true)
    expect(matchesIgnore('/.claude/settings.json')).toBe(true)
    expect(matchesIgnore('/.codex/logs/run.json')).toBe(true)
    expect(matchesIgnore('/.playwright-mcp/config.json')).toBe(true)
    expect(matchesIgnore('/.env')).toBe(true)
    expect(matchesIgnore('/.env.sentry-build-plugin')).toBe(true)
    expect(matchesIgnore('/docs/build.md')).toBe(true)
    expect(matchesIgnore('/src/main.ts')).toBe(true)
    expect(matchesIgnore('/build/runtime/qq-api-server.cjs')).toBe(true)
    expect(matchesIgnore('/build/assets/index.js.map')).toBe(true)
    expect(matchesIgnore('/scripts/dev/qq-api-server.cjs')).toBe(true)
    expect(matchesIgnore('/scripts/dev/qq-search-fallback.cjs')).toBe(true)
    expect(matchesIgnore('/node_modules/@fontsource/inter/index.css')).toBe(true)
    expect(matchesIgnore('/node_modules/@electron-forge/core/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/@playwright/test/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/@sentry/vite-plugin/dist/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/@types/node/index.d.ts')).toBe(true)
    expect(matchesIgnore('/node_modules/@vitejs/plugin-react/dist/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/electron/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/playwright/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/playwright-core/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/typescript/lib/typescript.js')).toBe(true)
    expect(matchesIgnore('/node_modules/vite/dist/node/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/vitest/dist/index.js')).toBe(true)
    expect(matchesIgnore('/node_modules/date-fns/index.cjs')).toBe(true)
    expect(matchesIgnore('/scripts/utils/copy-deps.cjs')).toBe(true)
    expect(matchesIgnore('/node_modules/pkg/README.md')).toBe(true)
    expect(matchesIgnore('/node_modules/pkg/.github/workflows/release.yml')).toBe(true)
    expect(matchesIgnore('/AGENTS.md')).toBe(true)
    expect(matchesIgnore('/LICENSE')).toBe(true)
  })

  it('keeps packaged runtime assets required inside app.asar', () => {
    expect(matchesIgnore('/build/index.html')).toBe(false)
    expect(matchesIgnore('/build/electron/main.cjs')).toBe(false)
    expect(matchesIgnore('/public/tray.ico')).toBe(false)
    expect(matchesIgnore('/node_modules/pkg/dist/index.js')).toBe(false)
  })

  it('copies required runtime scripts via extraResource instead of app.asar', () => {
    expect(getExtraResources()).toEqual([
      'build/service',
      'build/runtime/qq-api-server.cjs',
      'scripts/dev/qq-search-fallback.cjs',
      'scripts/dev/netease-api-server.cjs'
    ])
  })
})

describe('forge.config packaging hooks', () => {
  it('does not rely on packageAfterPrune repair copies', () => {
    expect(config.hooks?.packageAfterPrune).toBeUndefined()
  })

  it('removes workspace artifacts from both candidate roots via afterCopy', async () => {
    const [afterCopyHook] = getAfterCopyHooks()
    const tempBuildPath = await mkdtemp(join(tmpdir(), 'luo-music-after-copy-'))
    const appRoot = join(tempBuildPath, 'resources', 'app')
    const { packagingWorkspaceArtifactsToRemove } = await loadForgeModule()

    try {
      await mkdir(appRoot, { recursive: true })
      await Promise.all(
        packagingWorkspaceArtifactsToRemove.flatMap(entry => [
          mkdir(join(tempBuildPath, entry), { recursive: true }),
          mkdir(join(appRoot, entry), { recursive: true })
        ])
      )

      const keepRoot = join(tempBuildPath, 'keep.txt')
      const keepApp = join(appRoot, 'keep.txt')
      await Promise.all([writeFile(keepRoot, 'keep'), writeFile(keepApp, 'keep')])

      await runPackagerHook(afterCopyHook, tempBuildPath)

      await Promise.all(
        packagingWorkspaceArtifactsToRemove.flatMap(async entry => {
          await expect(stat(join(tempBuildPath, entry))).rejects.toBeDefined()
          await expect(stat(join(appRoot, entry))).rejects.toBeDefined()
        })
      )

      await expect(stat(keepRoot)).resolves.toBeDefined()
      await expect(stat(keepApp)).resolves.toBeDefined()
    } finally {
      await rm(tempBuildPath, { recursive: true, force: true })
    }
  })

  it('removes build-only node_modules from both candidate roots via afterPrune', async () => {
    const [afterPruneHook] = getAfterPruneHooks()
    const tempBuildPath = await mkdtemp(join(tmpdir(), 'luo-music-after-prune-'))
    const appRoot = join(tempBuildPath, 'resources', 'app')
    const { packagingNodeModulesToRemoveAfterPrune } = await loadForgeModule()

    try {
      await mkdir(appRoot, { recursive: true })
      await Promise.all(
        packagingNodeModulesToRemoveAfterPrune.flatMap(entry => [
          mkdir(join(tempBuildPath, entry), { recursive: true }),
          mkdir(join(appRoot, entry), { recursive: true })
        ])
      )

      const keepRoot = join(tempBuildPath, 'node_modules', 'should-keep')
      const keepApp = join(appRoot, 'node_modules', 'should-keep')
      await Promise.all([mkdir(keepRoot, { recursive: true }), mkdir(keepApp, { recursive: true })])

      await runPackagerHook(afterPruneHook, tempBuildPath)

      await Promise.all(
        packagingNodeModulesToRemoveAfterPrune.flatMap(async entry => {
          await expect(stat(join(tempBuildPath, entry))).rejects.toBeDefined()
          await expect(stat(join(appRoot, entry))).rejects.toBeDefined()
        })
      )

      await expect(stat(keepRoot)).resolves.toBeDefined()
      await expect(stat(keepApp)).resolves.toBeDefined()
    } finally {
      await rm(tempBuildPath, { recursive: true, force: true })
    }
  })

  it('prunes unused Electron locale files after extracting the runtime', async () => {
    const [afterExtractHook] = getAfterExtractHooks()
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-locales-'))
    const localesDir = join(tempRoot, 'locales')

    try {
      await mkdir(localesDir, { recursive: true })
      await Promise.all([
        writeFile(join(localesDir, 'en-US.pak'), 'en'),
        writeFile(join(localesDir, 'zh-CN.pak'), 'zh'),
        writeFile(join(localesDir, 'fr.pak'), 'fr'),
        writeFile(join(localesDir, 'ja.pak'), 'ja')
      ])

      await runPackagerHook(afterExtractHook, tempRoot)

      const remainingLocales = await readdir(localesDir)
      expect(remainingLocales.sort()).toEqual(['en-US.pak', 'zh-CN.pak'])
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps fast make zip builds available on darwin, linux, and win32', async () => {
    const fastConfig = await loadForgeConfig('1')
    const zipMaker = fastConfig.makers?.find(maker => getMakerName(maker) === 'zip')

    expect(zipMaker).toBeDefined()
    expect((zipMaker as { platformsToMakeOn?: string[] }).platformsToMakeOn).toEqual([
      'darwin',
      'linux',
      'win32'
    ])
  })
})
