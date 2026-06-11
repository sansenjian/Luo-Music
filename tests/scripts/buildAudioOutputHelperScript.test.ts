import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import * as nodeFs from 'node:fs'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const script = readFileSync(
  resolve(process.cwd(), 'scripts/build/build-audio-output-helper.cjs'),
  'utf8'
)
const require = createRequire(import.meta.url)
const buildAudioOutputHelper = require(
  resolve(process.cwd(), 'scripts/build/build-audio-output-helper.cjs')
) as {
  main: (options: {
    argv?: string[]
    console?: Pick<Console, 'log' | 'warn'>
    env?: NodeJS.ProcessEnv
    fs?: typeof import('node:fs')
    platform?: NodeJS.Platform
    projectRoot?: string
    spawnSync?: typeof import('node:child_process').spawnSync
  }) => number
}

describe('build audio output helper script', () => {
  it('can pass opt-in Cargo features to the helper build', () => {
    expect(script).toContain('LUO_AUDIO_OUTPUT_HELPER_FEATURES')
    expect(script).toContain("cargoArgs.push('--features', cargoFeatures.join(','))")
    expect(script).toContain("args.has('--ffmpeg')")
  })

  it('marks copied non-Windows helpers as executable', () => {
    expect(script).toContain('ensureExecutableModeIfNeeded(context, context.packagedHelperPath')
    expect(script).toContain('ensureExecutableModeIfNeeded(context, context.helperExePath')
    expect(script).toContain("context.platform === 'win32'")
    expect(script).toContain('context.fs.chmodSync(helperPath, mode | 0o755)')
  })

  it.each(['darwin', 'linux'] as const)(
    'copies the %s helper resource without a Windows extension and marks it executable',
    platform => {
      const tempRoot = createAudioOutputHelperProject(platform)
      const chmodSync = vi.fn((filePath, mode) => {
        nodeFs.chmodSync(filePath, mode)
      }) as unknown as typeof import('node:fs').chmodSync
      const fsMock = Object.assign(Object.create(nodeFs), {
        chmodSync
      }) as typeof import('node:fs')
      const spawnSync = vi.fn(() => ({
        pid: 1,
        output: [],
        stdout: null,
        stderr: null,
        status: 0,
        signal: null
      })) as unknown as typeof import('node:child_process').spawnSync
      const consoleMock = {
        log: vi.fn(),
        warn: vi.fn()
      }

      try {
        const exitCode = buildAudioOutputHelper.main({
          argv: ['--release', '--copy-resource', '--required'],
          console: consoleMock,
          env: {},
          fs: fsMock,
          platform,
          projectRoot: tempRoot,
          spawnSync
        })

        const manifestPath = resolve(tempRoot, 'native/audio-engine/Cargo.toml')
        const packagedHelperPath = resolve(tempRoot, 'build/native/audio-output-helper')

        expect(exitCode).toBe(0)
        expect(spawnSync).toHaveBeenCalledWith(
          'cargo',
          ['build', '--manifest-path', manifestPath, '-p', 'audio-output-helper', '--release'],
          {
            cwd: tempRoot,
            stdio: 'inherit',
            shell: false
          }
        )
        expect(readFileSync(packagedHelperPath, 'utf8')).toBe('helper')
        expect(existsSync(resolve(tempRoot, 'build/native/audio-output-helper.exe'))).toBe(false)
        expect(chmodSync).toHaveBeenCalledWith(packagedHelperPath, expect.any(Number))
        expect(consoleMock.warn).not.toHaveBeenCalled()
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it('builds the FFmpeg variant with a suffixed packaged helper name', () => {
    const tempRoot = createAudioOutputHelperProject('win32')
    const spawnSync = vi.fn(() => ({
      pid: 1,
      output: [],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null
    })) as unknown as typeof import('node:child_process').spawnSync

    try {
      const exitCode = buildAudioOutputHelper.main({
        argv: ['--release', '--copy-resource', '--ffmpeg'],
        env: {},
        platform: 'win32',
        projectRoot: tempRoot,
        spawnSync
      })

      const manifestPath = resolve(tempRoot, 'native/audio-engine/Cargo.toml')

      expect(exitCode).toBe(0)
      expect(spawnSync).toHaveBeenCalledWith(
        expect.any(String),
        [
          'build',
          '--manifest-path',
          manifestPath,
          '-p',
          'audio-output-helper',
          '--release',
          '--features',
          'ffmpeg'
        ],
        expect.objectContaining({ cwd: tempRoot })
      )
      expect(existsSync(resolve(tempRoot, 'build/native/audio-output-helper-ffmpeg.exe'))).toBe(
        true
      )
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

function createAudioOutputHelperProject(platform: NodeJS.Platform): string {
  const tempRoot = resolve(tmpdir(), `luo-music-audio-helper-${platform}-${process.pid}`)
  rmSync(tempRoot, { recursive: true, force: true })
  mkdirSync(resolve(tempRoot, 'native/audio-engine/target/release'), { recursive: true })
  writeFileSync(
    resolve(tempRoot, 'native/audio-engine/Cargo.toml'),
    '[workspace]\nresolver = "2"\nmembers = ["audio-output-helper"]\n'
  )
  mkdirSync(resolve(tempRoot, 'native/audio-engine/audio-output-helper/src'), { recursive: true })
  writeFileSync(
    resolve(tempRoot, 'native/audio-engine/audio-output-helper/Cargo.toml'),
    '[package]\nname = "audio-output-helper"\nversion = "0.1.0"\nedition = "2021"\n'
  )
  writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ version: '0.16.0' }))
  writeFileSync(
    resolve(tempRoot, 'native/audio-engine/target/release/audio-output-helper'),
    'helper'
  )
  writeFileSync(
    resolve(tempRoot, 'native/audio-engine/target/release/audio-output-helper.exe'),
    'helper'
  )
  return tempRoot
}
