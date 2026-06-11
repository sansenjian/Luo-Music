import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  audioOutputHelperPathEnv,
  getAudioOutputHelperBuildScriptPath,
  getAudioOutputHelperFileName,
  getDefaultAudioOutputHelperPath,
  prepareAudioOutputHelper,
  resolveAudioOutputHelperPath
} = require('../../scripts/audio-output-helper-path.cjs') as {
  audioOutputHelperPathEnv: string
  getAudioOutputHelperBuildScriptPath: (options?: { projectRoot?: string }) => string
  getAudioOutputHelperFileName: (platform?: NodeJS.Platform) => string
  getDefaultAudioOutputHelperPath: (options?: {
    projectRoot?: string
    platform?: NodeJS.Platform
  }) => string
  prepareAudioOutputHelper: (options?: {
    projectRoot?: string
    env?: Record<string, string | undefined>
    platform?: NodeJS.Platform
    spawnSync?: (...args: unknown[]) => { error?: Error; status?: number | null }
    stdio?: string
  }) => {
    helperPath: string
    helperPathSource: string
    shouldBuild: boolean
  }
  resolveAudioOutputHelperPath: (options?: {
    projectRoot?: string
    env?: Record<string, string | undefined>
    platform?: NodeJS.Platform
  }) => {
    helperPath: string
    helperPathSource: string
    shouldBuild: boolean
  }
}

function createTempProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'luo-audio-helper-path-'))
}

describe('audio output helper path resolver', () => {
  it('defaults to the debug helper and marks it buildable', () => {
    const projectRoot = resolve('D:/Project/LUO')
    const helperPath = getDefaultAudioOutputHelperPath({
      projectRoot,
      platform: 'win32'
    })

    expect(helperPath).toBe(
      resolve(projectRoot, 'native/audio-engine/target/debug/audio-output-helper.exe')
    )
    expect(
      resolveAudioOutputHelperPath({
        projectRoot,
        env: {},
        platform: 'win32'
      })
    ).toMatchObject({
      helperPath,
      helperPathSource: 'debug-build',
      shouldBuild: true
    })
  })

  it('uses LUO_AUDIO_OUTPUT_HELPER_PATH and skips the debug build when provided', () => {
    const projectRoot = createTempProjectRoot()
    const helperFileName = getAudioOutputHelperFileName()
    const relativeHelperPath = join('build', 'native', helperFileName)
    const helperPath = resolve(projectRoot, relativeHelperPath)
    mkdirSync(resolve(projectRoot, 'build', 'native'), { recursive: true })
    writeFileSync(helperPath, 'fake helper')
    const spawnCalls: unknown[][] = []

    try {
      const helperInfo = prepareAudioOutputHelper({
        projectRoot,
        env: {
          [audioOutputHelperPathEnv]: relativeHelperPath
        },
        spawnSync: (...args: unknown[]) => {
          spawnCalls.push(args)
          return { status: 0 }
        },
        stdio: 'pipe'
      })

      expect(spawnCalls).toEqual([])
      expect(helperInfo).toMatchObject({
        helperPath,
        helperPathSource: 'env',
        shouldBuild: false
      })
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('builds and validates the default debug helper when no override is set', () => {
    const projectRoot = createTempProjectRoot()
    const helperPath = getDefaultAudioOutputHelperPath({ projectRoot })
    mkdirSync(resolve(helperPath, '..'), { recursive: true })
    writeFileSync(helperPath, 'fake debug helper')
    const spawnCalls: unknown[][] = []

    try {
      const helperInfo = prepareAudioOutputHelper({
        projectRoot,
        env: {},
        spawnSync: (...args: unknown[]) => {
          spawnCalls.push(args)
          return { status: 0 }
        },
        stdio: 'pipe'
      })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0][0]).toBe(process.execPath)
      expect(spawnCalls[0][1]).toEqual([getAudioOutputHelperBuildScriptPath({ projectRoot })])
      expect(helperInfo).toMatchObject({
        helperPath,
        helperPathSource: 'debug-build',
        shouldBuild: true
      })
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('fails early when the override path does not exist', () => {
    const projectRoot = createTempProjectRoot()

    try {
      expect(() =>
        prepareAudioOutputHelper({
          projectRoot,
          env: {
            [audioOutputHelperPathEnv]: 'build/native/missing-helper.exe'
          },
          stdio: 'pipe'
        })
      ).toThrow(audioOutputHelperPathEnv)
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
