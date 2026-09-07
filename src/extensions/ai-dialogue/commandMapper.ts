import { COMMANDS } from '@/core/commands/commands'
import type { ToolCall } from './types'

export interface CommandExecution {
  commandId: string
  payload?: Record<string, unknown>
  /** 标记该命令有返回值，AI 需要拿到结果继续对话 */
  hasResult?: boolean
}

const PLAY_MODE_MAP: Record<string, number> = {
  sequential: 0,
  random: 1,
  singleLoop: 2,
  listLoop: 3
}

export function mapToolCallToCommand(toolCall: ToolCall): CommandExecution | null {
  const name = toolCall.function?.name
  const args = toolCall.function?.arguments ?? {}

  switch (name) {
    case 'player_playPause':
      return { commandId: COMMANDS.PLAYER_TOGGLE_PLAY }
    case 'player_next':
      return { commandId: COMMANDS.PLAYER_PLAY_NEXT }
    case 'player_prev':
      return { commandId: COMMANDS.PLAYER_PLAY_PREV }
    case 'player_setVolume': {
      const volume = Number(args.volume)
      if (!Number.isFinite(volume)) return null
      return { commandId: COMMANDS.PLAYER_SET_VOLUME, payload: { volume } }
    }
    case 'player_setMute': {
      if (typeof args.muted !== 'boolean') return null
      return { commandId: COMMANDS.PLAYER_SET_MUTE, payload: { muted: args.muted } }
    }
    case 'player_setPlayMode': {
      const mode = typeof args.mode === 'string' ? PLAY_MODE_MAP[args.mode] : undefined
      if (mode === undefined) return null
      return { commandId: COMMANDS.PLAYER_SET_PLAY_MODE, payload: { mode } }
    }
    case 'player_searchAndPlay': {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) return null
      return { commandId: COMMANDS.PLAYER_SEARCH_AND_PLAY, payload: { query } }
    }
    // ===== 平台工具 =====
    case 'platform_search': {
      const platformId = typeof args.platformId === 'string' ? args.platformId : ''
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : ''
      if (!platformId || !keyword) return null
      return {
        commandId: COMMANDS.PLATFORM_SEARCH,
        payload: { platformId, keyword, limit: Number(args.limit) || 10 },
        hasResult: true
      }
    }
    case 'platform_getLyric': {
      const platformId = typeof args.platformId === 'string' ? args.platformId : ''
      const songId = typeof args.songId === 'string' ? args.songId : String(args.songId ?? '')
      if (!platformId || !songId) return null
      return {
        commandId: COMMANDS.PLATFORM_GET_LYRIC,
        payload: { platformId, songId },
        hasResult: true
      }
    }
    case 'platform_getPlaylistDetail': {
      const platformId = typeof args.platformId === 'string' ? args.platformId : ''
      const playlistId =
        typeof args.playlistId === 'string' ? args.playlistId : String(args.playlistId ?? '')
      if (!platformId || !playlistId) return null
      return {
        commandId: COMMANDS.PLATFORM_GET_PLAYLIST_DETAIL,
        payload: { platformId, playlistId },
        hasResult: true
      }
    }
    default:
      return null
  }
}
