import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function loadForgeConfig(fastMakeMode?: string) {
  const previousFastMakeMode = process.env.LUO_FAST_MAKE

  if (fastMakeMode === undefined) {
    delete process.env.LUO_FAST_MAKE
  } else {
    process.env.LUO_FAST_MAKE = fastMakeMode
  }

  vi.resetModules()

  try {
    return (await import('../../forge.config')).default
  } finally {
    if (previousFastMakeMode === undefined) {
      delete process.env.LUO_FAST_MAKE
    } else {
      process.env.LUO_FAST_MAKE = previousFastMakeMode
    }
  }
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

type AfterExtractHook = (
  buildPath: string,
  electronVersion: string,
  platform: string,
  arch: string,
  callback: (error?: Error | null) => void
) => void

function getAfterExtractHooks(): AfterExtractHook[] {
  const afterExtract = config.packagerConfig?.afterExtract

  expect(Array.isArray(afterExtract)).toBe(true)

  return [...(afterExtract as AfterExtractHook[])]
}

describe('forge.config packagerConfig.ignore', () => {
  it('ignores development-only roots, scripts, sourcemaps, and dependency metadata', () => {
    expect(matchesIgnore('/.ai/session.json')).toBe(true)
    expect(matchesIgnore('/.claude/settings.json')).toBe(true)
    expect(matchesIgnore('/.codex/logs/run.json')).toBe(true)
    expect(matchesIgnore('/.env')).toBe(true)
    expect(matchesIgnore('/.env.sentry-build-plugin')).toBe(true)
    expect(matchesIgnore('/docs/build.md')).toBe(true)
    expect(matchesIgnore('/src/main.ts')).toBe(true)
    expect(matchesIgnore('/build/runtime/qq-api-server.cjs')).toBe(true)
    expect(matchesIgnore('/build/assets/index.js.map')).toBe(true)
    expect(matchesIgnore('/scripts/dev/qq-api-server.cjs')).toBe(true)
    expect(matchesIgnore('/scripts/dev/qq-search-fallback.cjs')).toBe(true)
    expect(matchesIgnore('/node_modules/@fontsource/inter/index.css')).toBe(true)
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
      'build/server',
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

  it('prunes unused Electron locale files after extracting the runtime', async () => {
    const [afterExtractHook] = getAfterExtractHooks()
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-locales-'))
    const localesDir = join(tempRoot, 'locales')

    await mkdir(localesDir, { recursive: true })
    await Promise.all([
      writeFile(join(localesDir, 'en-US.pak'), 'en'),
      writeFile(join(localesDir, 'zh-CN.pak'), 'zh'),
      writeFile(join(localesDir, 'fr.pak'), 'fr'),
      writeFile(join(localesDir, 'ja.pak'), 'ja')
    ])

    await new Promise<void>((resolve, reject) => {
      afterExtractHook(tempRoot, '40.8.5', 'win32', 'x64', error => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    const remainingLocales = await readdir(localesDir)
    expect(remainingLocales.sort()).toEqual(['en-US.pak', 'zh-CN.pak'])
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
