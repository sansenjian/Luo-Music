export const COMMANDS = {
  PLAYER_TOGGLE_PLAY: 'player.togglePlay',
  PLAYER_PLAY_PREV: 'player.playPrev',
  PLAYER_PLAY_NEXT: 'player.playNext',
  PLAYER_TOGGLE_PLAY_MODE: 'player.togglePlayMode',
  PLAYER_VOLUME_UP: 'player.volumeUp',
  PLAYER_VOLUME_DOWN: 'player.volumeDown',
  PLAYER_SEEK_FORWARD: 'player.seekForward',
  PLAYER_SEEK_BACK: 'player.seekBack',
  PLAYER_TOGGLE_PLAYER_DOCKED: 'player.togglePlayerDocked',
  DESKTOP_LYRIC_TOGGLE: 'desktopLyric.toggle'
} as const

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS]

export const COMMAND_ENABLEMENT: Partial<Record<CommandId, string>> = {
  [COMMANDS.PLAYER_TOGGLE_PLAY]: 'player.hasCurrentSong',
  [COMMANDS.PLAYER_PLAY_PREV]: 'player.hasPlaylist',
  [COMMANDS.PLAYER_PLAY_NEXT]: 'player.hasPlaylist',
  [COMMANDS.PLAYER_TOGGLE_PLAY_MODE]: 'player.hasPlaylist',
  [COMMANDS.PLAYER_SEEK_FORWARD]: 'player.canSeek',
  [COMMANDS.PLAYER_SEEK_BACK]: 'player.canSeek',
  [COMMANDS.DESKTOP_LYRIC_TOGGLE]: 'platform.isElectron'
}
