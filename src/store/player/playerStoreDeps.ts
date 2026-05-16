import type { StoreGeneric } from 'pinia'

import { services } from '@/services'
import type { MusicService } from '@/services/musicService'
import type { PlatformService } from '@/services/platformService'
import type { StorageService } from '@/services/storageService'
import { playerCore as defaultAudioManager } from '@/utils/player/core/playerCore'
import type { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import type { LyricLine } from '@shared/player/lyric'
import type { WebLyricAppearance } from '@shared/types/player'
import type { Song } from '@shared/types/schemas'
import type { PlayerState } from './playerState'
import type { PlayerStoreOwner } from './runtime'

export type PlayerStoreActions = {
  seek: (time: number) => void
  playNextSkipUnavailable: () => Promise<void>
  initAudio: () => void
  setupIpcListeners: () => void
  teardownIpcListeners: () => void
  notifyPlayingState: (playing?: boolean) => void
  notifyPlayModeChange: () => void
  handleAudioError: (error: unknown) => Promise<void>
  createErrorHandler: () => PlaybackErrorHandler
  applyResolvedLyricIndex: (time?: number) => boolean
  updateLyricIndex: (time?: number) => boolean
  setSongList: (songs: Song[]) => void
  replaceQueue: (songs: Song[]) => void
  replaceQueueAndPlay: (songs: Song[], index: number) => Promise<void>
  addSong: (song: Song) => void
  playSongByIndex: (index: number, song?: Song) => Promise<void>
  playSongWithDetails: (index: number, autoSkip?: boolean) => Promise<void>
  togglePlay: () => void
  getRandomIndex: (excludeCurrent?: boolean) => number
  playPrev: () => void
  playNext: () => void
  handleSongEnd: () => void
  resetErrorHandler: () => void
  setVolume: (vol: number) => void
  toggleMute: () => void
  togglePlayMode: () => void
  setPlayMode: (mode: PlayerState['playMode']) => void
  setLyric: (lyric: unknown) => void
  toggleLyricType: (type: 'trans' | 'roma') => void
  setWebLyricAppearance: (patch: Partial<WebLyricAppearance>) => void
  resetWebLyricAppearance: () => void
  togglePlayerDocked: () => void
  setLyricsArray: (lyrics: LyricLine[]) => void
  removeSongFromPlaylist: (index: number) => void
  clearPlaylist: () => void
}

export type PlayerStoreInstance = PlayerState &
  PlayerStoreActions &
  PlayerStoreOwner & {
    $state: PlayerState
  } & StoreGeneric

export type PlayerStoreMusicService = Pick<
  MusicService,
  'getPlatformCapabilities' | 'getSongUrl' | 'getSongDetail' | 'getLyric'
>
export type PlayerStoreStorageService = Pick<StorageService, 'setItem'>
export type PlayerStorePlatformService = Pick<
  PlatformService,
  'isElectron' | 'send' | 'sendPlayingState' | 'sendPlayModeChange' | 'on'
>
export type PlayerStoreAudioManager = Pick<
  typeof defaultAudioManager,
  'getMuted' | 'pause' | 'play' | 'seek' | 'setMuted' | 'setVolume' | 'toggle'
> & {
  src?: string
}

export type PlayerStoreDeps = {
  getMusicService?: () => PlayerStoreMusicService
  getStorageService?: () => PlayerStoreStorageService
  getPlatformAccessor?: () => PlayerStorePlatformService
  audioManager?: PlayerStoreAudioManager
}

function getDefaultPlayerStoreDeps(): Required<PlayerStoreDeps> {
  return {
    getMusicService: () => services.music(),
    getStorageService: () => services.storage(),
    getPlatformAccessor: () => services.platform(),
    audioManager: defaultAudioManager
  }
}

export function resolvePlayerStoreDeps(deps: PlayerStoreDeps): Required<PlayerStoreDeps> {
  const defaultDeps = getDefaultPlayerStoreDeps()

  return {
    getMusicService: deps.getMusicService ?? defaultDeps.getMusicService,
    getStorageService: deps.getStorageService ?? defaultDeps.getStorageService,
    getPlatformAccessor: deps.getPlatformAccessor ?? defaultDeps.getPlatformAccessor,
    audioManager: deps.audioManager ?? defaultDeps.audioManager
  }
}
