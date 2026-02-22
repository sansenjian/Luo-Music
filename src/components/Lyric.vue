<script setup>
import { ref, computed, watch, onUnmounted, onMounted, nextTick } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { animate } from 'animejs'
import { throttle } from '../utils/performance'

const playerStore = usePlayerStore()

const lyricContainer = ref(null)
const lyricScrollArea = ref(null)
const lyricsListRef = ref(null)
let pauseActiveTimer = null
let isUserScrolling = false
let scrollAnimation = null

// 歌词偏移相关
const lineOffset = ref(0)
const containerHeight = ref(0)
const lineHeight = ref(0)

// Use store state directly
const currentLyricIndex = computed(() => playerStore.currentLyricIndex)
const lyrics = computed(() => playerStore.lyricsArray)
const progress = computed(() => playerStore.progress)
const playing = computed(() => playerStore.playing)

const showOriginal = computed(() => playerStore.lyricType.includes('original'))
const showTrans = computed(() => playerStore.lyricType.includes('trans'))
const showRoma = computed(() => playerStore.lyricType.includes('roma'))

// 间奏相关
const isInterlude = ref(false)
const interludeRemainingTime = ref(0)
let interludeTimer = null

function handleLyricClick(time) {
  playerStore.seek(time)
}

// 计算歌词位置 - 使用 anime.js 实现高性能滚动
function updateLyricPosition() {
  if (isUserScrolling || !lyricsListRef.value || !lyrics.value.length) return
  
  const currentIndex = currentLyricIndex.value
  if (currentIndex < 0) return
  
  // 计算每行平均高度
  const avgLineHeight = lineHeight.value || 60
  
  // 计算目标偏移量 - 将当前行居中
  const targetOffset = -(currentIndex * avgLineHeight) + (containerHeight.value / 2) - (avgLineHeight / 2)
  
  // 取消之前的动画
  if (scrollAnimation) {
    scrollAnimation.pause()
  }
  
  // 使用 anime.js 实现平滑滚动
  scrollAnimation = animate(lyricsListRef.value, {
    translateY: targetOffset,
    duration: 300,
    ease: 'out(2)'
  })
}

// 检查是否处于间奏
function checkInterlude() {
  const currentIndex = currentLyricIndex.value
  const lyricsArr = lyrics.value
  
  if (!lyricsArr || currentIndex < 0 || currentIndex >= lyricsArr.length - 1) {
    isInterlude.value = false
    return
  }
  
  const currentTime = lyricsArr[currentIndex].time
  const nextTime = lyricsArr[currentIndex + 1].time
  const gap = nextTime - currentTime
  
  // 如果间隔大于 5 秒，认为是间奏
  if (gap > 5) {
    isInterlude.value = true
    interludeRemainingTime.value = Math.floor(nextTime - progress.value)
    
    clearTimeout(interludeTimer)
    interludeTimer = setTimeout(() => {
      isInterlude.value = false
    }, (gap - 1) * 1000)
  } else {
    isInterlude.value = false
  }
}

// 监听歌词索引变化
watch(currentLyricIndex, () => {
  updateLyricPosition()
  checkInterlude()
})

// 监听播放进度更新间奏倒计时
watch(progress, (newProgress) => {
  if (isInterlude.value) {
    const currentIndex = currentLyricIndex.value
    const lyricsArr = lyrics.value
    if (lyricsArr && currentIndex >= 0 && currentIndex < lyricsArr.length - 1) {
      const nextTime = lyricsArr[currentIndex + 1].time
      interludeRemainingTime.value = Math.max(0, Math.floor(nextTime - newProgress))
    }
  }
})

// 节流处理用户滚动
const handleScroll = throttle(() => {
  isUserScrolling = true
  
  if (pauseActiveTimer) {
    clearTimeout(pauseActiveTimer)
  }
  
  pauseActiveTimer = setTimeout(() => {
    isUserScrolling = false
    updateLyricPosition()
  }, 3000)
}, 100)

// 计算行高度
function calculateLineHeight() {
  if (lyricsListRef.value && lyrics.value.length > 0) {
    const firstLine = lyricsListRef.value.querySelector('.lyric-line')
    if (firstLine) {
      lineHeight.value = firstLine.offsetHeight + 16 // 包含 margin
    }
  }
  if (lyricContainer.value) {
    containerHeight.value = lyricContainer.value.clientHeight
  }
}

onMounted(() => {
  calculateLineHeight()
  window.addEventListener('resize', calculateLineHeight)
})

onUnmounted(() => {
  if (pauseActiveTimer) {
    clearTimeout(pauseActiveTimer)
  }
  if (interludeTimer) {
    clearTimeout(interludeTimer)
  }
  if (scrollAnimation) {
    scrollAnimation.pause()
  }
  window.removeEventListener('resize', calculateLineHeight)
})

// 监听歌词变化重新计算
watch(lyrics, () => {
  nextTick(() => {
    calculateLineHeight()
    // 重置位置
    if (lyricsListRef.value) {
      animate(lyricsListRef.value, {
        translateY: 0,
        duration: 0
      })
    }
  })
}, { deep: true })
</script>

<template>
  <div class="lyric" ref="lyricContainer">
    <!-- 间奏提示 -->
    <Transition name="fade">
      <div v-if="isInterlude" class="interlude-indicator">
        <div class="interlude-content">
          <div class="diamond">
            <div class="diamond-inner"></div>
          </div>
          <div class="interlude-info">
            <span class="interlude-title">间奏</span>
            <span class="remaining-time">{{ interludeRemainingTime }}s</span>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="lyrics.length === 0" class="empty-state">
      <div class="empty-icon">♪</div>
      <div>Search and play a track to view lyrics</div>
    </div>

    <div v-else class="lyrics-wrapper" ref="lyricScrollArea" @scroll="handleScroll" @wheel="handleScroll" @touchstart="handleScroll">
      <div 
        class="lyrics-list" 
        ref="lyricsListRef"
      >
        <div
          v-for="(item, index) in lyrics"
          :key="index"
          class="lyric-line"
          :class="{
            active: index === currentLyricIndex,
            passed: index < currentLyricIndex
          }"
          @click="handleLyricClick(item.time)"
        >
          <div v-if="item.rlyric && showRoma" class="lyric-roma">
            {{ item.rlyric }}
          </div>
          <div v-if="showOriginal" class="lyric-main">
            {{ item.lyric }}
          </div>
          <div v-if="item.tlyric && showTrans" class="lyric-trans">
            {{ item.tlyric }}
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

/* 间奏提示 */
.interlude-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
}

.interlude-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  color: white;
}

.diamond {
  width: 20px;
  height: 20px;
  border: 2px solid white;
  transform: rotate(45deg);
  animation: diamond-rotate 2s ease-in-out infinite;
  position: relative;
}

@keyframes diamond-rotate {
  0%, 100% { transform: rotate(45deg); }
  50% { transform: rotate(135deg); }
}

.diamond-inner {
  width: 60%;
  height: 60%;
  background: white;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.interlude-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.interlude-title {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.remaining-time {
  font-size: 18px;
  font-weight: bold;
  font-family: 'Bender-Bold', monospace;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
  overflow: hidden;
  position: relative;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.lyrics-wrapper::-webkit-scrollbar {
  display: none;
}

.lyrics-list {
  padding: 50vh 40px;
  will-change: transform;
}

/* Compact mode styles for Lyric */
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
  transition: opacity 0.3s ease, filter 0.3s ease;
  padding: 8px 12px;
  border-left: 3px solid transparent;
  opacity: 0.4;
  transform-origin: left center;
}

.lyric-line:hover {
  opacity: 0.7;
}

.lyric-line:active {
  transform: scale(0.98);
}

.lyric-line.active {
  background: var(--black);
  color: var(--white);
  border-left-color: var(--accent);
  opacity: 1;
  font-weight: 700;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);
}

.lyric-line.active .lyric-trans,
.lyric-line.active .lyric-roma {
  color: var(--gray-light);
  opacity: 0.9;
}

.lyric-line.passed {
  opacity: 0.2;
  filter: blur(0.5px);
}

.lyric-line.passed:hover {
  opacity: 0.5;
  filter: blur(0);
}

.lyric-line:not(.active):not(.passed) {
  opacity: 0.5;
}

/* 非活动行模糊效果 */
.lyrics-list:has(.lyric-line.active) .lyric-line:not(.active):not(.passed) {
  filter: blur(0.3px);
}

.lyrics-list:has(.lyric-line.active) .lyric-line:not(.active):not(.passed):hover {
  filter: blur(0);
  opacity: 0.7;
}

.lyric-roma {
  font-size: 12px;
  color: var(--gray);
  letter-spacing: 0.02em;
  margin-bottom: 4px;
  transition: all 0.3s ease;
}

.lyric-main {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  transition: font-size 0.3s ease;
  word-break: break-word;
}

.lyric-line.active .lyric-main {
  font-size: 22px;
}

.lyric-trans {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.4;
  margin-top: 4px;
  transition: all 0.3s ease;
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
    font-size: 20px;
  }
  
  .interlude-content {
    padding: 10px 16px;
  }
  
  .diamond {
    width: 16px;
    height: 16px;
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
    font-size: 18px;
  }

  .lyric-trans {
    font-size: 12px;
  }
}
</style>
