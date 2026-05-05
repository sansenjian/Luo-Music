import { computed, ref, watch } from 'vue'

import { COMMANDS } from '@/core/commands/commands'
import { services } from '@/services'
import type { CommandService } from '@/services/commandService'
import { songPrefetcher } from '@/store/player/songPrefetcher'
import { usePlayerStore } from '@/store/playerStore'

const SWIPE_THRESHOLD = 50
const MAX_OFFSET = 280

export type CoverSwipeDeps = {
  commandService?: Pick<CommandService, 'canExecute' | 'execute'>
}

export type SwipeDirection = 'prev' | 'next' | null

export function useCoverSwipe(deps: CoverSwipeDeps = {}) {
  const commandService = deps.commandService ?? services.commands()

  const offsetX = ref(0)
  const isSwiping = ref(false)
  const swipeDirection = computed<SwipeDirection>(() => {
    if (!isSwiping.value) return null
    if (offsetX.value > SWIPE_THRESHOLD) return 'prev'
    if (offsetX.value < -SWIPE_THRESHOLD) return 'next'
    return null
  })
  let startX = 0

  // When the swipe direction is determined, immediately prefetch the
  // target song's URL so it's ready by the time the pointer is released.
  watch(swipeDirection, direction => {
    if (!direction) return
    const store = usePlayerStore()
    const list = store.songList
    const idx = store.currentIndex
    const targetIdx = direction === 'next' ? idx + 1 : idx - 1
    if (targetIdx >= 0 && targetIdx < list.length) {
      const target = list[targetIdx]
      if (!target.url) {
        songPrefetcher.prefetchSong(target).catch(() => {})
      }
    }
  })

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    startX = e.clientX
    isSwiping.value = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!isSwiping.value) return
    const delta = e.clientX - startX
    offsetX.value = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, delta))
  }

  function onPointerUp() {
    if (!isSwiping.value) return
    isSwiping.value = false

    if (offsetX.value < -SWIPE_THRESHOLD) {
      void commandService.execute(COMMANDS.PLAYER_PLAY_NEXT)
    } else if (offsetX.value > SWIPE_THRESHOLD) {
      void commandService.execute(COMMANDS.PLAYER_PLAY_PREV)
    }

    offsetX.value = 0
  }

  function onPointerCancel() {
    isSwiping.value = false
    offsetX.value = 0
  }

  return {
    offsetX,
    isSwiping,
    swipeDirection,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel
  }
}

export type CoverSwipeReturn = ReturnType<typeof useCoverSwipe>
