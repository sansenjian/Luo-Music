import { describe, expect, it } from 'vitest'

import config from '../../forge.config'

function matchesIgnore(relativePath: string): boolean {
  const ignorePatterns = config.packagerConfig.ignore

  expect(Array.isArray(ignorePatterns)).toBe(true)

  return (ignorePatterns as Array<string | RegExp>).some(pattern =>
    typeof pattern === 'string' ? relativePath.includes(pattern) : pattern.test(relativePath)
  )
}

describe('forge.config packagerConfig.ignore', () => {
  it('ignores development-only roots and tooling files', () => {
    expect(matchesIgnore('/.ai/session.json')).toBe(true)
    expect(matchesIgnore('/.claude/settings.json')).toBe(true)
    expect(matchesIgnore('/.codex/logs/run.json')).toBe(true)
    expect(matchesIgnore('/.env')).toBe(true)
    expect(matchesIgnore('/.env.sentry-build-plugin')).toBe(true)
    expect(matchesIgnore('/docs/build.md')).toBe(true)
    expect(matchesIgnore('/src/main.ts')).toBe(true)
    expect(matchesIgnore('/scripts/utils/copy-deps.cjs')).toBe(true)
    expect(matchesIgnore('/AGENTS.md')).toBe(true)
    expect(matchesIgnore('/LICENSE')).toBe(true)
  })

  it('keeps packaged runtime assets and extra resources', () => {
    expect(matchesIgnore('/build/index.html')).toBe(false)
    expect(matchesIgnore('/build/electron/main.cjs')).toBe(false)
    expect(matchesIgnore('/public/tray.ico')).toBe(false)
    expect(matchesIgnore('/scripts/dev/qq-api-server.cjs')).toBe(false)
    expect(matchesIgnore('/scripts/dev/netease-api-server.cjs')).toBe(false)
  })
})

describe('forge.config packaging hooks', () => {
  it('does not rely on packageAfterPrune repair copies', () => {
    expect(config.hooks?.packageAfterPrune).toBeUndefined()
  })
})
