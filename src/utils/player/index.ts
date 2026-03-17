export * from './constants'
export * from './helpers'
export * from './core'
export * from './modules'

import { playerCore as audioManager } from './core/playerCore'
import { playbackController } from './core/playbackController'
import { playlistManager } from './core/playlistManager'
import { LyricEngine } from './core/lyric'

export function createPlayer() {
  return {
    audio: audioManager,
    playback: playbackController,
    playlist: playlistManager,
    lyric: new LyricEngine()
  }
}

// Default export for backward compatibility
import { playerCore } from './core/playerCore'
import { playbackController as pc } from './core/playbackController'
import { playlistManager as pm } from './core/playlistManager'
import { LyricParser, LyricEngine as LE } from './core/lyric'
import { timeFormatter } from './helpers/timeFormatter'
import { shuffleHelper } from './helpers/shuffleHelper'
import { PlaybackErrorHandler } from './modules/playbackErrorHandler'
import { PLAY_MODE, PLAY_MODE_LABELS, PLAY_MODE_ICONS } from './constants/playMode'
import { TIME_INTERVAL, SKIP_CONFIG } from './constants/timeInterval'
import { VOLUME, AUDIO_CONFIG } from './constants/volume'

export default {
  audioManager: playerCore,
  playbackController: pc,
  playlistManager: pm,
  LyricParser,
  LyricEngine: LE,
  timeFormatter,
  shuffleHelper,
  PlaybackErrorHandler,
  PLAY_MODE,
  PLAY_MODE_LABELS,
  PLAY_MODE_ICONS,
  TIME_INTERVAL,
  SKIP_CONFIG,
  VOLUME,
  AUDIO_CONFIG,
  createPlayer
}
