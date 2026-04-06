import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { COMMANDS } from '../core/commands/commands'
import type { Song } from '../types/schemas'
import { services } from '../services'
import type { CommandService } from '../services/commandService'
import { usePlayerStore } from '../store/playerStore'
import {
  animateAlbumCover,
  animateButtonClick,
  animateLoopMode,
  animatePlayPause
} from './useAnimations'
import { useSlider } from './useSlider'
import { useThrottledStyleUpdate } from './useThrottledStyleUpdate'

type PlayModeSvgElement =
  | { d: string; circle?: never }
  | { circle: { cx: number; cy: number; r: number }; d?: never }

const DEFAULT_COVER =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Crect fill=%22%23d1d5d8%22 width=%22300%22 height=%22300%22/%3E%3C/svg%3E'

const PLAY_MODE_ICONS: PlayModeSvgElement[][] = [
  [{ d: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z' }, { d: 'M17 10l5 5-5 5V10z' }],
  [{ d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' }],
  [
    { d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' },
    { circle: { cx: 12, cy: 12, r: 2 } }
  ],
  [
    {
      d: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
    }
  ]
]

const PLAY_MODE_TEXT = [
  '\u987a\u5e8f\u64ad\u653e',
  '\u5217\u8868\u5faa\u73af',
  '\u5355\u66f2\u5faa\u73af',
  '\u968f\u673a\u64ad\u653e'
] as const

function resolveCoverUrl(url?: string): string {
  if (!url) return DEFAULT_COVER
  if (url.startsWith('data:')) return url
  try {
    return new URL(url).protocol.match(/^https?:$/) ? url : DEFAULT_COVER
  } catch {
    return DEFAULT_COVER
  }
}

/**
 * Creates a Vue Composition API view-model for the player UI, exposing reactive state, element refs, sliders, and UI handlers used by the player component.
 *
 * The returned view-model wires store state, command permissions, animations, and throttled style updates so the component can bind UI elements and invoke player actions.
 *
 * @returns An object containing:
 * - `playerStore` — the player store instance
 * - element refs: `playButtonRef`, `prevButtonRef`, `nextButtonRef`, `loopButtonRef`, `coverImgRef`, `volumeFillRef`
 * - computed values: `currentSong`, `progressPercent`, `volumePercent`, `volumeDisplay`, `artistText`, `coverUrl`, `playModeSvg`, `playModeText`
 * - permission flags: `canTogglePlay`, `canNavigatePlaylist`, `canTogglePlayMode`, `canToggleDesktopLyric`
 * - sliders: `progressSlider`, `volumeSlider`
 * - UI handlers: `onPlayButtonClick`, `onPrevButtonClick`, `onNextButtonClick`, `toggleDesktopLyric`, `onLoopButtonClick`
 */
export type PlayerViewModelDeps = {
  commandService?: Pick<CommandService, 'canExecute' | 'execute'>
  playerStore?: ReturnType<typeof usePlayerStore>
}

export function usePlayerViewModel(deps: PlayerViewModelDeps = {}) {
  const commandService = deps.commandService ?? services.commands()
  const playerStore = deps.playerStore ?? usePlayerStore()

  const playButtonRef = ref<HTMLButtonElement | null>(null)
  const prevButtonRef = ref<HTMLButtonElement | null>(null)
  const nextButtonRef = ref<HTMLButtonElement | null>(null)
  const loopButtonRef = ref<HTMLButtonElement | null>(null)
  const coverImgRef = ref<HTMLImageElement | null>(null)
  const volumeFillRef = ref<HTMLDivElement | null>(null)

  const currentSong = computed<Song | null>(() => playerStore.currentSong)
  const progressPercent = computed(() =>
    playerStore.duration ? (playerStore.progress / playerStore.duration) * 100 : 0
  )
  const volumePercent = computed(() => playerStore.volume * 100)
  const volumeDisplay = computed(() => Math.round(volumePercent.value))
  const artistText = computed(
    () => currentSong.value?.artists.map(artist => artist.name).join(' / ') || 'Unknown Artist'
  )
  const coverUrl = computed(() => resolveCoverUrl(currentSong.value?.album?.picUrl))
  const playModeSvg = computed<PlayModeSvgElement[]>(
    () => PLAY_MODE_ICONS[Math.max(0, Math.min(playerStore.playMode, 3))] || PLAY_MODE_ICONS[0]
  )
  const playModeText = computed(
    () => PLAY_MODE_TEXT[Math.max(0, Math.min(playerStore.playMode, 3))] || PLAY_MODE_TEXT[0]
  )

  const canTogglePlay = computed(
    () => !!currentSong.value && commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)
  )
  const canNavigatePlaylist = computed(
    () => playerStore.songList.length > 0 && commandService.canExecute(COMMANDS.PLAYER_PLAY_NEXT)
  )
  const canTogglePlayMode = computed(
    () =>
      playerStore.songList.length > 0 && commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY_MODE)
  )
  const canToggleDesktopLyric = computed(() =>
    commandService.canExecute(COMMANDS.DESKTOP_LYRIC_TOGGLE)
  )

  const progressSlider = useSlider({
    onUpdate: percent => playerStore.seek(percent * playerStore.duration),
    getValue: () => (playerStore.duration ? playerStore.progress / playerStore.duration : 0)
  })

  const volumeSlider = useSlider({
    onUpdate: percent => playerStore.setVolume(percent),
    getValue: () => playerStore.volume
  })

  function onPlayButtonClick() {
    if (!canTogglePlay.value) return
    animateButtonClick(playButtonRef.value)
    animatePlayPause(playButtonRef.value, !playerStore.playing)
    void commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAY)
  }

  function onPrevButtonClick() {
    if (!canNavigatePlaylist.value) return
    animateButtonClick(prevButtonRef.value)
    void commandService.execute(COMMANDS.PLAYER_PLAY_PREV)
  }

  function onNextButtonClick() {
    if (!canNavigatePlaylist.value) return
    animateButtonClick(nextButtonRef.value)
    void commandService.execute(COMMANDS.PLAYER_PLAY_NEXT)
  }

  function toggleDesktopLyric() {
    if (!canToggleDesktopLyric.value) return
    void commandService.execute(COMMANDS.DESKTOP_LYRIC_TOGGLE)
  }

  function onLoopButtonClick() {
    if (!canTogglePlayMode.value) return
    animateLoopMode(loopButtonRef.value)
    void commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAY_MODE)
  }

  watch(
    () => playerStore.currentSong,
    () => {
      void nextTick(() => coverImgRef.value && animateAlbumCover(coverImgRef.value))
    },
    { immediate: true }
  )

  useThrottledStyleUpdate({
    source: volumePercent,
    targetRef: volumeFillRef,
    minChange: 1
  })

  onMounted(() => {
    if (volumeFillRef.value) volumeFillRef.value.style.width = `${volumePercent.value}%`
  })

  return {
    playerStore,
    playButtonRef,
    prevButtonRef,
    nextButtonRef,
    loopButtonRef,
    coverImgRef,
    volumeFillRef,
    currentSong,
    progressPercent,
    volumePercent,
    volumeDisplay,
    artistText,
    coverUrl,
    playModeSvg,
    playModeText,
    canTogglePlay,
    canNavigatePlaylist,
    canTogglePlayMode,
    canToggleDesktopLyric,
    progressSlider,
    volumeSlider,
    onPlayButtonClick,
    onPrevButtonClick,
    onNextButtonClick,
    toggleDesktopLyric,
    onLoopButtonClick
  }
}
