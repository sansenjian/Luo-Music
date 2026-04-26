<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

import HomeEmptyState from './home/HomeEmptyState.vue'
import { uiMessages } from '@/messages/ui'
import { useActiveLyricState } from '@/composables/useActiveLyricState'
import { useLyricAutoScroll } from '@/composables/useLyricAutoScroll'
import { useLyricVirtualScroll } from '@/composables/useLyricVirtualScroll'
import { usePlayerStore } from '@/store/playerStore'
import { resolveLyricDisplayLine } from '@/utils/player/lyric-display'

const VIRTUALIZE_THRESHOLD = 50

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

const playerStore = usePlayerStore()
const lyricScrollArea = ref<HTMLElement | null>(null)
const lineContainer = ref<HTMLElement | null>(null)
const { lyrics, currentLyricIndex, showOriginal, showTrans, showRoma } = useActiveLyricState()

const resolvedLyrics = computed(() =>
  lyrics.value.map(item =>
    resolveLyricDisplayLine(item, {
      showOriginal: showOriginal.value,
      showTrans: showTrans.value,
      showRoma: showRoma.value
    })
  )
)

const shouldVirtualize = computed(() => resolvedLyrics.value.length > VIRTUALIZE_THRESHOLD)
const lyricCount = computed(() => resolvedLyrics.value.length)

const virtualScroll = useLyricVirtualScroll({
  scrollArea: lyricScrollArea,
  itemCount: lyricCount
})

const visibleLyrics = computed(() => {
  if (!shouldVirtualize.value) {
    return resolvedLyrics.value.map((item, index) => ({ item, index }))
  }
  const start = virtualScroll.startIndex.value
  const end = virtualScroll.endIndex.value
  return resolvedLyrics.value.slice(start, end).map((item, offset) => ({
    item,
    index: start + offset
  }))
})

// Re-measure lines when visibility toggles change (line heights change)
watch([showOriginal, showTrans, showRoma], () => {
  virtualScroll.clearCache()
  virtualScroll.updateScrollState()
  void nextTick(() => measureVisibleLines())
})

// Pin the active line so it's always rendered (needed for auto-scroll
// to find it via querySelector).
watch(
  currentLyricIndex,
  idx => {
    if (shouldVirtualize.value) {
      virtualScroll.pinActiveIndex(idx)
    }
  },
  { immediate: true }
)

// Re-measure when the visible range changes
watch([virtualScroll.startIndex, virtualScroll.endIndex], () => {
  void nextTick(() => measureVisibleLines())
})

function measureVisibleLines() {
  if (!lineContainer.value || !shouldVirtualize.value) return
  const children = lineContainer.value.children
  for (let i = 0; i < children.length; i++) {
    const el = children[i]
    if (el instanceof HTMLElement) {
      virtualScroll.measureLineEl(el)
    }
  }
}

function handleLyricClick(time: number) {
  playerStore.seek(time)
}

function handleLyricKeydown(event: KeyboardEvent, time: number) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  handleLyricClick(time)
}

const { handleScroll, handleUserScrollStart } = useLyricAutoScroll({
  scrollArea: lyricScrollArea,
  lyrics,
  activeIndex: currentLyricIndex,
  active: () => props.active,
  alignSources: [showOriginal, showTrans, showRoma],
  resetSources: [() => playerStore.currentSong?.id]
})
</script>

<template>
  <div class="lyric" :class="{ 'is-player-docked': playerStore.isPlayerDocked }">
    <HomeEmptyState
      v-if="lyrics.length === 0"
      :visual="uiMessages.home.emptyState.lyric.visual"
      :title="uiMessages.home.emptyState.lyric.title"
      :description="uiMessages.home.emptyState.lyric.description"
    />

    <div
      v-else
      ref="lyricScrollArea"
      class="lyrics-wrapper"
      @scroll="handleScroll"
      @wheel.passive="handleUserScrollStart"
      @touchstart.passive="handleUserScrollStart"
    >
      <!-- Virtualized mode -->
      <div
        v-if="shouldVirtualize"
        ref="lineContainer"
        class="lyrics-list lyrics-list-virtual"
        :style="{
          paddingTop: virtualScroll.paddingTop.value + 'px',
          paddingBottom: virtualScroll.paddingBottom.value + 'px'
        }"
      >
        <div
          v-for="{ item, index } in visibleLyrics"
          :key="index"
          :data-li="index"
          class="lyric-line"
          role="button"
          tabindex="0"
          :aria-current="index === currentLyricIndex ? 'true' : undefined"
          :class="{
            active: index === currentLyricIndex,
            passed: index < currentLyricIndex
          }"
          @click="handleLyricClick(item.time)"
          @keydown="handleLyricKeydown($event, item.time)"
        >
          <div v-if="item.showRoma" class="lyric-roma">
            {{ item.roma }}
          </div>
          <div v-if="item.showOriginal" class="lyric-main">
            {{ item.original }}
          </div>
          <div v-if="item.showTrans" class="lyric-trans">
            {{ item.trans }}
          </div>
        </div>
      </div>

      <!-- Non-virtualized mode (short lyrics) -->
      <div v-else class="lyrics-list">
        <div
          v-for="(item, index) in resolvedLyrics"
          :key="`${item.time}-${index}`"
          class="lyric-line"
          role="button"
          tabindex="0"
          :aria-current="index === currentLyricIndex ? 'true' : undefined"
          :class="{
            active: index === currentLyricIndex,
            passed: index < currentLyricIndex
          }"
          @click="handleLyricClick(item.time)"
          @keydown="handleLyricKeydown($event, item.time)"
        >
          <div v-if="item.showRoma" class="lyric-roma">
            {{ item.roma }}
          </div>
          <div v-if="item.showOriginal" class="lyric-main">
            {{ item.original }}
          </div>
          <div v-if="item.showTrans" class="lyric-trans">
            {{ item.trans }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyric {
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  position: relative;
}

.lyrics-wrapper {
  height: 100%;
  overflow-y: auto;
  position: relative;
  scroll-behavior: auto;
}

.lyrics-wrapper::-webkit-scrollbar {
  width: 6px;
}

.lyrics-wrapper::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.lyrics-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.lyrics-list {
  position: relative;
  padding: 50vh 40px;
}

.lyrics-list-virtual {
  /* Virtual mode uses dynamic padding instead of fixed top padding.
     The bottom half of the viewport is the initial scroll anchor. */
  padding-left: 40px;
  padding-right: 40px;
  padding-top: 0;
  padding-bottom: 0;
}

.lyric.is-player-docked .lyric-line {
  margin-bottom: 12px;
  padding: 6px 10px;
}

.lyric.is-player-docked .lyric-main {
  font-size: 16px;
}

.lyric.is-player-docked .lyric-trans,
.lyric.is-player-docked .lyric-roma {
  font-size: 11px;
}

.lyric-line {
  margin-bottom: 16px;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
  padding: 8px 12px;
  border-left: 3px solid transparent;
  position: relative;
}

.lyric-line:hover,
.lyric-line:active {
  opacity: 0.8;
  background: rgba(0, 0, 0, 0.02);
}

.lyric-line.active {
  background: var(--black);
  color: var(--white);
  border-left-color: var(--accent);
  opacity: 1 !important;
  font-weight: 700;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);
}

.lyric-line.active .lyric-main {
  color: var(--white);
}

.lyric-line.active .lyric-roma,
.lyric-line.active .lyric-trans {
  color: var(--gray-light);
  opacity: 0.9;
}

.lyric-line.passed {
  opacity: 0.15;
}

.lyric-line.passed:hover,
.lyric-line.passed:active {
  opacity: 0.4;
}

/* 未播放的歌词行 - 不包括 active 和 passed */
.lyric-line:not(.active):not(.passed) {
  opacity: 0.5;
}

.lyric-roma {
  font-size: 12px;
  color: var(--gray);
  letter-spacing: 0.02em;
  margin-bottom: 4px;
}

.lyric-main {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  transition: color 0.2s ease;
  word-break: break-word;
}

.lyric-trans {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.4;
  margin-top: 4px;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
  word-break: break-word;
}

@media (max-width: 900px) {
  .lyrics-list,
  .lyrics-list-virtual {
    padding-left: 24px;
    padding-right: 24px;
  }

  .lyric-main {
    font-size: 16px;
  }
}

@media (max-width: 600px) {
  .lyrics-list,
  .lyrics-list-virtual {
    padding-left: 16px;
    padding-right: 16px;
  }

  .lyric-main {
    font-size: 15px;
  }

  .lyric-trans {
    font-size: 12px;
  }
}
</style>
