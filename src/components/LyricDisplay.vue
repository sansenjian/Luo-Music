<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { usePlayerStore } from '../store/playerStore.ts'
import { animate } from 'animejs'

const playerStore = usePlayerStore()

const lyricContainer = ref(null)
const lyricScrollArea = ref(null)
let pauseActiveTimer = null
let isUserScrolling = false
let scrollEndTimer = null

// Virtual List Constants
const VIRTUAL_LIST_THRESHOLD = 100
const VISIBLE_BUFFER = 10
const ESTIMATED_LINE_HEIGHT = 60

// Use store state directly
const currentLyricIndex = computed(() => playerStore.currentLyricIndex)
const lyrics = computed(() => playerStore.lyricsArray)

// Virtual List Calculation
const shouldUseVirtualList = computed(() => {
  return lyrics.value.length > VIRTUAL_LIST_THRESHOLD
})

const visibleRange = computed(() => {
  if (!shouldUseVirtualList.value) {
    return { start: 0, end: lyrics.value.length }
  }
  
  const container = lyricScrollArea.value
  if (!container) return { start: 0, end: VISIBLE_BUFFER }
  
  const scrollTop = container.scrollTop
  const visibleCount = Math.ceil(container.clientHeight / ESTIMATED_LINE_HEIGHT)
  
  const start = Math.floor(scrollTop / ESTIMATED_LINE_HEIGHT)
  
  return {
    start: Math.max(0, start - VISIBLE_BUFFER),
    end: Math.min(lyrics.value.length, start + visibleCount + VISIBLE_BUFFER)
  }
})

// Placeholder height
const placeholderHeight = computed(() => {
  if (!shouldUseVirtualList.value) return 0
  const { start } = visibleRange.value
  return start * ESTIMATED_LINE_HEIGHT
})

// Visible lyrics
const visibleLyrics = computed(() => {
  const { start, end } = visibleRange.value
  return lyrics.value.slice(start, end).map((item, index) => ({
    ...item,
    originalIndex: start + index
  }))
})

const showOriginal = computed(() => playerStore.lyricType.includes('original'))
const showTrans = computed(() => playerStore.lyricType.includes('trans'))
const showRoma = computed(() => playerStore.lyricType.includes('roma'))

function handleLyricClick(time) {
  playerStore.seek(time)
}

function scrollToActiveLine() {
  if (isUserScrolling || !lyricScrollArea.value) return
  
  const activeLine = lyricScrollArea.value.querySelector('.lyric-line.active')
  if (!activeLine) return
  
  const container = lyricScrollArea.value
  const lineOffsetTop = activeLine.offsetTop
  const lineHeight = activeLine.offsetHeight
  const containerHeight = container.clientHeight
  
  const targetScroll = Math.max(0, lineOffsetTop - containerHeight / 2 + lineHeight / 2)
  
  // Use anime.js for smooth scrolling
  animate(container, {
    scrollTop: targetScroll,
    duration: 300,
    easing: 'easeOutQuad'
  })
}

watch(currentLyricIndex, () => {
  scrollToActiveLine()
})

function handleScroll() {
  isUserScrolling = true
  
  if (pauseActiveTimer) clearTimeout(pauseActiveTimer)
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  
  scrollEndTimer = setTimeout(() => {
    scrollEndTimer = null
    pauseActiveTimer = setTimeout(() => {
      isUserScrolling = false
      scrollToActiveLine()
    }, 500)
  }, 150)
}

onUnmounted(() => {
  if (pauseActiveTimer) clearTimeout(pauseActiveTimer)
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  // anime.remove(lyricScrollArea.value) // animate in animejs v4 might not have a global remove or handle it differently
})
</script>

<template>
  <div class="lyric" ref="lyricContainer">
    <div v-if="lyrics.length === 0" class="empty-state">
      <div class="empty-icon">♪</div>
      <div>Search and play a track to view lyrics</div>
    </div>

    <div v-else class="lyrics-wrapper" ref="lyricScrollArea" @scroll="handleScroll" @wheel="handleScroll" @touchstart="handleScroll">
      <div class="lyrics-list">
        <!-- Virtual List Placeholder -->
        <div v-if="shouldUseVirtualList" class="placeholder" :style="{ height: `${placeholderHeight}px` }"></div>
        
        <!-- Render Visible Lyrics -->
        <div
          v-for="item in visibleLyrics"
          :key="item.originalIndex"
          class="lyric-line"
          :class="{
            active: item.originalIndex === currentLyricIndex,
            passed: item.originalIndex < currentLyricIndex
          }"
          @click="handleLyricClick(item.time)"
        >
          <div v-if="item.roma && showRoma" class="lyric-roma">
            {{ item.roma }}
          </div>
          <div v-if="showOriginal" class="lyric-main">
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
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.3;
}

.lyrics-wrapper {
  height: 100%;
  overflow-y: auto; /* Enable native scrolling */
  position: relative;
  /* Smooth scrolling handled by anime.js, but keep smooth for user */
  scroll-behavior: auto; /* Let anime.js handle it, or smooth for user? mixed can be weird */
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

.placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

:global(.player-compact) .lyric-line {
  margin-bottom: 12px;
  padding: 6px 10px;
}

:global(.player-compact) .lyric-main {
  font-size: 16px;
}

:global(.player-compact) .lyric-line.active .lyric-main {
  font-size: 18px;
}

:global(.player-compact) .lyric-trans,
:global(.player-compact) .lyric-roma {
  font-size: 11px;
}

.lyric-line {
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 8px 12px;
  border-left: 3px solid transparent;
  opacity: 0.4;
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
  opacity: 1;
  font-weight: 700;
  transform: scale(1.05);
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
  transition: font-size 0.3s;
  word-break: break-word;
}

.lyric-line.active .lyric-main {
  font-size: 20px;
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

  .lyric-line.active .lyric-main {
    font-size: 18px;
  }
}

@media (max-width: 600px) {
  .lyrics-list {
    padding: 50vh 16px;
  }

  .lyric-main {
    font-size: 15px;
  }

  .lyric-line.active .lyric-main {
    font-size: 17px;
  }

  .lyric-trans {
    font-size: 12px;
  }
}
</style>
