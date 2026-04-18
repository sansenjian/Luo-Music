import { getIpcProxy } from './ipcProxy'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels'

import type { Song, SongPlatform } from '../../../src/types/schemas'
import type { PlayMode, PlayerStateResponse } from '../../../src/types/player'
import type { LyricLine } from '../../../src/utils/player/core/lyric'
import type {
  DesktopLyricSnapshot,
  PlayerPlaySongByIdPayload,
  PlayerPlaySongPayload
} from '../../ipc/types'

export type PlayerState = PlayerStateResponse

// Re-export types for convenience
export type { Song, PlayMode, LyricLine }

export class PlayerProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>

  constructor() {
    this.ipcProxy = getIpcProxy()
  }

  async play(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY)
  }

  async pause(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PAUSE)
  }

  async toggle(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE)
  }

  async playSong(song: Song, playlist?: Song[]): Promise<void> {
    const payload: PlayerPlaySongPayload = { song, playlist }
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG, payload)
  }

  async playSongById(id: string | number, platform: SongPlatform = 'netease'): Promise<void> {
    const payload: PlayerPlaySongByIdPayload = { id, platform }
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID, payload)
  }

  async skipToPrevious(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS)
  }

  async skipToNext(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT)
  }

  async seekTo(time: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SEEK_TO, time)
  }

  async setVolume(volume: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SET_VOLUME, volume)
  }

  async toggleMute(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE)
  }

  async setPlayMode(mode: PlayMode): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE, mode)
  }

  async togglePlayMode(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE)
  }

  async getState(): Promise<PlayerState> {
    return this.ipcProxy.invoke<PlayerState>(INVOKE_CHANNELS.PLAYER_GET_STATE)
  }

  async getCurrentSong(): Promise<Song | null> {
    return this.ipcProxy.invoke<Song | null>(INVOKE_CHANNELS.PLAYER_GET_CURRENT_SONG)
  }

  async getPlaylist(): Promise<Song[]> {
    return this.ipcProxy.invoke<Song[]>(INVOKE_CHANNELS.PLAYER_GET_PLAYLIST)
  }

  async getDesktopLyricSnapshot(): Promise<DesktopLyricSnapshot> {
    return this.ipcProxy.invoke<DesktopLyricSnapshot>(
      INVOKE_CHANNELS.PLAYER_GET_DESKTOP_LYRIC_SNAPSHOT
    )
  }

  async addToNext(song: Song): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT, song)
  }

  async removeFromPlaylist(index: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST, index)
  }

  async clearPlaylist(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST)
  }

  async getLyric(
    songId: string | number,
    platform: SongPlatform = 'netease'
  ): Promise<LyricLine[]> {
    return this.ipcProxy.invoke<LyricLine[]>(INVOKE_CHANNELS.PLAYER_GET_LYRIC, {
      id: songId,
      platform
    })
  }

  onPlayStateChange(
    listener: (data: { isPlaying: boolean; currentTime: number }) => void
  ): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_STATE_CHANGE, listener)
  }

  onSongChange(listener: (data: { song: Song | null; index: number }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_TRACK_CHANGED, listener)
  }

  onLyricUpdate(listener: (data: { index: number; line: LyricLine | null }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_LYRIC_UPDATE, listener)
  }

  onPlayError(listener: (data: { error: string; song: Song | null }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_PLAY_ERROR, listener)
  }
}

let globalPlayerProxy: PlayerProxy | null = null

export function getPlayerProxy(): PlayerProxy {
  if (!globalPlayerProxy) {
    globalPlayerProxy = new PlayerProxy()
  }

  return globalPlayerProxy
}
