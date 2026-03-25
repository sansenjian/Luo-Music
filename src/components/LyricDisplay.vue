<script setup lang="ts">
import { ref } from 'vue'

import { useActiveLyricState } from '../composables/useActiveLyricState'
import { useLyricAutoScroll } from '../composables/useLyricAutoScroll'
import { usePlayerStore } from '../store/playerStore'
import type { LyricLine } from '../utils/player/core/lyric'

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

const playerStore = usePlayerStore()
const lyricScrollArea = ref(null)
const { lyrics, currentLyricIndex, showOriginal, showTrans, showRoma } = useActiveLyricState()

function handleLyricClick(time: number) {
  playerStore.seek(time)
}

function shouldShowOriginalLine(item: LyricLine) {
  if (showOriginal.value) {
    return true
  }

  const hasVisibleTrans = showTrans.value && Boolean(item.trans)
  const hasVisibleRoma = showRoma.value && Boolean(item.roma)

  return !hasVisibleTrans && !hasVisibleRoma
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
  <div class="lyric">
    <div v-if="lyrics.length === 0" class="empty-state">
      <div class="empty-icon">LRC</div>
      <div>Search and play a track to view lyrics</div>
    </div>

    <div
      v-else
      ref="lyricScrollArea"
      class="lyrics-wrapper"
      @scroll="handleScroll"
      @wheel.passive="handleUserScrollStart"
      @touchstart.passive="handleUserScrollStart"
    >
      <div class="lyrics-list">
        <div
          v-for="(item, index) in lyrics"
          :key="`${item.time}-${index}`"
          class="lyric-line"
          :class="{
            active: index === currentLyricIndex,
            passed: index < currentLyricIndex
          }"
          @click="handleLyricClick(item.time)"
        >
          <div v-if="item.roma && showRoma" class="lyric-roma">
            {{ item.roma }}
          </div>
          <div v-if="shouldShowOriginalLine(item)" class="lyric-main">
            {{ item.text }}
          </div>
          <div v-if="item.trans && showTrans" class="lyric-trans">
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

.empty-state {
  text-align: center;
  padding: 80px 40px;
  color: var(--gray);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 12px;
  letter-spacing: 0.12em;
  opacity: 0.3;
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

:global(.player-compact) .lyric-line {
  margin-bottom: 12px;
  padding: 6px 10px;
}

:global(.player-compact) .lyric-main {
  font-size: 16px;
}

:global(.player-compact) .lyric-trans,
:global(.player-compact) .lyric-roma {
  font-size: 11px;
}

.lyric-line {
  margin-bottom: 16px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  padding: 8px 12px;
  border-left: 3px solid transparent;
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

.lyric-line.active .lyric-trans {
  color: var(--gray-light);
  opacity: 0.8;
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
  transition: all 0.3s;
  word-break: break-word;
}

@media (max-width: 900px) {
  .lyrics-list {
    padding: 50vh 24px;
  }

  .lyric-main {
    font-size: 16px;
  }
}

@media (max-width: 600px) {
  .lyrics-list {
    padding: 50vh 16px;
  }

  .lyric-main {
    font-size: 15px;
  }

  .lyric-trans {
    font-size: 12px;
  }
}
</style>
