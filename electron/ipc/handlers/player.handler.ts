/**
 * 播放器控制 IPC 处理器
 */

import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'
import type { Song } from '../../../src/types/schemas'
import type { PlayMode } from '../types'

export function registerPlayerHandlers(windowManager: WindowManager): void {
  // ========== Invoke Handlers ==========
  // Player control invoke handlers - forward commands back to renderer process
  // The actual audio playback happens in renderer via HTML5 Audio element

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PLAY, async () => {
    windowManager.send('music-playing-control', 'play')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PAUSE, async () => {
    windowManager.send('music-playing-control', 'pause')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE, async () => {
    windowManager.send('music-playing-control')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS, async () => {
    windowManager.send('music-song-control', 'prev')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT, async () => {
    windowManager.send('music-song-control', 'next')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SEEK_TO, async (time: number) => {
    windowManager.send('music-playing-control', { type: 'seek', time })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SET_VOLUME, async (volume: number) => {
    windowManager.send('music-playing-control', { type: 'volume', volume })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE, async () => {
    windowManager.send('music-playing-control', 'toggle-mute')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE, async (mode: PlayMode) => {
    windowManager.send('music-playmode-control', mode)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE, async () => {
    // Toggle play mode - renderer will handle cycling through modes
    windowManager.send('music-playmode-control', 'toggle')
  })

  // Player state query handlers
  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_STATE, async () => {
    // State is managed in renderer, return empty state
    // The renderer should query its own playerStore directly
    return {
      isPlaying: false,
      isLoading: false,
      progress: 0,
      duration: 0,
      volume: 1,
      isMuted: false,
      playMode: 1 as PlayMode,
      playlist: [],
      currentIndex: -1,
      currentSong: null,
      currentLyricIndex: -1,
      showLyric: true,
      showPlaylist: false,
      isCompact: false
    }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_CURRENT_SONG, async () => {
    return null
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_PLAYLIST, async () => {
    return []
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT, async (_song: Song) => {
    // Handled in renderer via playerStore
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST, async (_index: number) => {
    // Handled in renderer via playerStore
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST, async () => {
    // Handled in renderer via playerStore
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_LYRIC, async () => {
    // Handled in renderer via playerStore
    return []
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG, async (_song: Song) => {
    // Handled in renderer via playerStore
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID, async (_id: string | number) => {
    // Handled in renderer via playerStore
  })

  // ========== Send Handlers ==========

  ipcService.registerSend(SEND_CHANNELS.MUSIC_PLAYING_CHECK, (playing: boolean) => {
    windowManager.updateThumbarButtons(playing)
  })

  ipcService.registerSend(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, (_mode: number) => {
    // 托盘菜单更新逻辑（如果需要可以在这里添加）
  })
}
