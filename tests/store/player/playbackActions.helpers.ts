import { vi } from 'vitest'

import { createInitialState } from '@/store/player/playerState'
import { PlaybackActions } from '@/store/player/playbackActions'
import type { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'

type MockPlaybackErrorHandler = PlaybackErrorHandler & {
  markAsUnavailable: ReturnType<typeof vi.fn>
  playNextSkipUnavailable: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  adapterMock: {
    getSongUrl: vi.fn(),
    getSongDetail: vi.fn(),
    getLyric: vi.fn()
  },
  lyricParseMock: vi.fn(),
  errorEmitMock: vi.fn(),
  noCopyrightMock: vi.fn((id: string | number) => {
    const error = new Error(`no copyright: ${id}`)
    error.name = 'AppError'
    ;(error as Error & { getUserMessage: () => string }).getUserMessage = () =>
      `No copyright for ${id}`
    return error
  }),
  fatalErrorMock: vi.fn((message: string) => new Error(message)),
  isCanceledRequestErrorMock: vi.fn((error: unknown) =>
    Boolean((error as { __cancel?: boolean })?.__cancel)
  )
}))

export const adapterMock = mocks.adapterMock
export const lyricParseMock = mocks.lyricParseMock
export const errorEmitMock = mocks.errorEmitMock
export const noCopyrightMock = mocks.noCopyrightMock
export const fatalErrorMock = mocks.fatalErrorMock
export const isCanceledRequestErrorMock = mocks.isCanceledRequestErrorMock

vi.mock('@/utils/player/core/lyric', () => ({
  LyricParser: {
    parse: mocks.lyricParseMock
  }
}))

vi.mock('@/utils/error/center', () => ({
  errorCenter: {
    emit: mocks.errorEmitMock
  }
}))

vi.mock('@/utils/error/types', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/error/types')>()

  return {
    ...actual,
    Errors: {
      ...actual.Errors,
      noCopyright: mocks.noCopyrightMock,
      fatal: mocks.fatalErrorMock
    }
  }
})

vi.mock('@/utils/http/cancelError', () => ({
  isCanceledRequestError: mocks.isCanceledRequestErrorMock
}))

export function resetPlaybackActionMocks() {
  vi.clearAllMocks()
}

export function createSubject() {
  const state = createInitialState()
  const onStateChange = vi.fn((changes: Partial<typeof state>) => Object.assign(state, changes))
  const playSongByIndex = vi.fn().mockResolvedValue(undefined)
  const setLyricsArray = vi.fn((lyrics: typeof state.lyricsArray) => {
    state.lyricsArray = lyrics
    state.lyricSong = lyrics.length > 0 ? state.currentSong : null
    state.currentLyricIndex = lyrics.length > 0 ? 0 : -1
  })
  const onPlaybackCommitted = vi.fn()
  const errorHandler: MockPlaybackErrorHandler = {
    markAsUnavailable: vi.fn(),
    playNextSkipUnavailable: vi.fn()
  } as unknown as MockPlaybackErrorHandler

  const actions = new PlaybackActions({
    getState: () => state,
    onStateChange,
    playSongByIndex,
    setLyricsArray,
    onPlaybackCommitted,
    musicService: adapterMock,
    createErrorHandler: vi.fn(() => errorHandler),
    getErrorHandler: vi.fn(() => errorHandler),
    platform: {
      isElectron: vi.fn(() => false)
    }
  })

  return {
    actions,
    state,
    onStateChange,
    playSongByIndex,
    setLyricsArray,
    onPlaybackCommitted,
    errorHandler
  }
}
