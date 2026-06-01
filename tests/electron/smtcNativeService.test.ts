import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@shared/player/playMode'
import type { PlayerStateSnapshot } from '@shared/contracts/ipc'
import { SmtcNativeService } from '../../electron/main/smtcNativeService'

function createPlayerState(overrides: Partial<PlayerStateSnapshot> = {}): PlayerStateSnapshot {
  return {
    isPlaying: false,
    isLoading: false,
    progress: 0,
    duration: 180,
    volume: 1,
    isMuted: false,
    playMode: PLAY_MODE.SEQUENTIAL,
    playlist: [],
    currentIndex: 0,
    currentSong: {
      id: 'song-1',
      name: 'Native Song',
      artists: [{ id: 'artist-1', name: 'Artist' }],
      album: { id: 'album-1', name: 'Album', picUrl: 'https://example.com/cover.jpg' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    },
    lyricSong: null,
    currentLyricIndex: -1,
    showLyric: true,
    showPlaylist: false,
    isPlayerDocked: false,
    lyricType: ['original', 'trans'],
    lyrics: [],
    desktopLyricSequence: 0,
    ...overrides
  }
}

function createFakeHelper() {
  const helper = new EventEmitter() as ChildProcessWithoutNullStreams
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const writes: string[] = []

  stdin.on('data', chunk => {
    writes.push(String(chunk))
  })

  Object.assign(helper, {
    stdout,
    stderr,
    stdin,
    killed: false,
    kill: vi.fn(() => {
      Object.assign(helper, { killed: true })
      helper.emit('exit', 0, null)
      return true
    })
  })

  return {
    helper,
    stdout,
    writes,
    commands: () =>
      writes
        .join('')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line) as { type: string; payload?: unknown })
  }
}

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}

describe('SmtcNativeService', () => {
  it('falls back to Chromium when the Rust helper binary is unavailable', async () => {
    const spawnHelper = vi.fn()
    const service = new SmtcNativeService({
      exists: () => false,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper
    })

    await expect(service.setEnabled(true, true)).resolves.toMatchObject({
      enabled: true,
      backend: 'chromium',
      nativeAvailable: false,
      helperRunning: false,
      restartRequired: true
    })
    expect(spawnHelper).not.toHaveBeenCalled()
  })

  it('starts the Rust helper and sends player state commands', async () => {
    const fake = createFakeHelper()
    const service = new SmtcNativeService({
      appPath: 'D:\\app',
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await expect(service.setEnabled(true, true)).resolves.toMatchObject({
      enabled: true,
      backend: 'native',
      nativeAvailable: true,
      helperRunning: true,
      restartRequired: false
    })

    service.syncPlayerState(
      createPlayerState({
        isPlaying: true,
        progress: 42,
        playMode: PLAY_MODE.SINGLE_LOOP
      })
    )

    expect(fake.commands().map(command => command.type)).toEqual([
      'initialize',
      'metadata',
      'playbackState',
      'playMode',
      'timeline',
      'enable'
    ])
    expect(fake.commands()[1]).toMatchObject({
      type: 'metadata',
      payload: {
        title: 'Native Song',
        artist: 'Artist',
        album: 'Album',
        durationMs: 180000
      }
    })
    expect(fake.commands()[2]).toMatchObject({
      type: 'playbackState',
      payload: { state: 'playing' }
    })
    expect(fake.commands()[3]).toMatchObject({
      type: 'playMode',
      payload: { shuffle: false, repeat: 'track' }
    })
  })

  it('keeps the native SMTC card hidden until a song is available', async () => {
    const fake = createFakeHelper()
    const service = new SmtcNativeService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await service.setEnabled(true)
    service.syncPlayerState(createPlayerState({ currentSong: null, duration: 0 }))

    expect(fake.commands().map(command => command.type)).toEqual(['initialize'])

    service.syncPlayerState(createPlayerState({ isPlaying: true }))
    expect(fake.commands().map(command => command.type)).toEqual([
      'initialize',
      'metadata',
      'playbackState',
      'playMode',
      'timeline',
      'enable'
    ])

    service.syncPlayerState(createPlayerState({ currentSong: null, duration: 0 }))
    expect(fake.commands().at(-1)).toMatchObject({ type: 'disable' })
  })

  it('uses readable fallback metadata when song fields are blank', async () => {
    const fake = createFakeHelper()
    const service = new SmtcNativeService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await service.setEnabled(true)
    service.syncPlayerState(
      createPlayerState({
        currentSong: {
          id: 'song-blank',
          name: '   ',
          artists: [],
          album: { id: 'album-blank', name: ' ', picUrl: '' },
          duration: 0,
          mvid: 0,
          platform: 'netease',
          originalId: 'song-blank'
        }
      })
    )

    const metadataCommand = fake.commands().find(command => command.type === 'metadata')
    expect(metadataCommand).toMatchObject({
      type: 'metadata',
      payload: {
        title: '未知歌曲',
        artist: '未知艺术家'
      }
    })
    expect(metadataCommand?.payload).not.toHaveProperty('album')
    expect(metadataCommand?.payload).not.toHaveProperty('artworkUrl')
  })

  it('prefers the freshly built debug helper in development mode', async () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const service = new SmtcNativeService({
      appPath: 'D:\\app',
      exists: filePath => filePath.includes('\\target\\debug\\'),
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper
    })

    await service.setEnabled(true)

    expect(spawnHelper).toHaveBeenCalledWith(
      'D:\\app\\native\\smtc-helper\\target\\debug\\smtc-helper.exe',
      [],
      expect.any(Object)
    )
  })

  it('maps helper transport events back to player commands', async () => {
    const fake = createFakeHelper()
    const onCommand = vi.fn()
    const service = new SmtcNativeService({
      exists: () => true,
      logger: createLoggerMock(),
      onCommand,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await service.setEnabled(true)

    fake.stdout.write('{"type":"nextTrack"}\n')
    fake.stdout.write('{"type":"seek","positionMs":42000}\n')

    expect(onCommand).toHaveBeenCalledWith({ type: 'nextTrack' })
    expect(onCommand).toHaveBeenCalledWith({ type: 'seek', positionSeconds: 42 })
  })

  it('falls back to Chromium and publishes status when the helper reports an error', async () => {
    const fake = createFakeHelper()
    const onStatusChange = vi.fn()
    const service = new SmtcNativeService({
      exists: () => true,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await service.setEnabled(true, true)
    onStatusChange.mockClear()

    fake.stdout.write('{"type":"error","message":"helper protocol mismatch"}\n')

    expect(fake.helper.kill).toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        backend: 'chromium',
        helperRunning: false,
        reason: 'helper protocol mismatch',
        restartRequired: true
      })
    )
  })

  it('publishes Chromium fallback status when the helper exits', async () => {
    const fake = createFakeHelper()
    const onStatusChange = vi.fn()
    const service = new SmtcNativeService({
      exists: () => true,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    await service.setEnabled(true, true)
    onStatusChange.mockClear()

    fake.helper.emit('exit', 1, null)

    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        backend: 'chromium',
        helperRunning: false,
        restartRequired: true
      })
    )
  })
})
