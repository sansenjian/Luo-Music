export * from './constants'
export * from './helpers'
export * from './core'
export * from './modules'

import { audioManager, AudioManager } from './core/audioManager'
import { playbackController, PlaybackController } from './core/playbackController'
import { playlistManager, PlaylistManager } from './core/playlistManager'
import { lyricProcessor, LyricProcessor } from './modules/lyricProcessor'
import { timeFormatter, TimeFormatter } from './helpers/timeFormatter'
import { shuffleHelper, ShuffleHelper } from './helpers/shuffleHelper'
import { PLAY_MODE, PLAY_MODE_LABELS, PLAY_MODE_ICONS } from './constants/playMode'
import { TIME_INTERVAL, SKIP_CONFIG } from './constants/timeInterval'
import { VOLUME, AUDIO_CONFIG } from './constants/volume'

export {
    audioManager,
    AudioManager,
    playbackController,
    PlaybackController,
    playlistManager,
    PlaylistManager,
    lyricProcessor,
    LyricProcessor,
    timeFormatter,
    TimeFormatter,
    shuffleHelper,
    ShuffleHelper,
    PLAY_MODE,
    PLAY_MODE_LABELS,
    PLAY_MODE_ICONS,
    TIME_INTERVAL,
    SKIP_CONFIG,
    VOLUME,
    AUDIO_CONFIG
}

export function createPlayer() {
    return {
        audio: audioManager,
        playback: playbackController,
        playlist: playlistManager,
        lyric: lyricProcessor
    }
}

export default {
    audioManager,
    playbackController,
    playlistManager,
    lyricProcessor,
    timeFormatter,
    shuffleHelper,
    PLAY_MODE,
    PLAY_MODE_LABELS,
    PLAY_MODE_ICONS,
    TIME_INTERVAL,
    SKIP_CONFIG,
    VOLUME,
    AUDIO_CONFIG,
    createPlayer
}
