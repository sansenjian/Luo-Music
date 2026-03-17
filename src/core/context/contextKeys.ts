export const CONTEXT_KEYS = {
  PLATFORM_IS_ELECTRON: 'platform.isElectron',
  PLAYER_HAS_CURRENT_SONG: 'player.hasCurrentSong',
  PLAYER_HAS_PLAYLIST: 'player.hasPlaylist',
  PLAYER_CAN_SEEK: 'player.canSeek'
} as const

export const COMMAND_CONTEXTS = {
  playerHasSong: CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG,
  playerHasPlaylist: CONTEXT_KEYS.PLAYER_HAS_PLAYLIST,
  playerCanSeek: CONTEXT_KEYS.PLAYER_CAN_SEEK,
  isElectron: CONTEXT_KEYS.PLATFORM_IS_ELECTRON
} as const
