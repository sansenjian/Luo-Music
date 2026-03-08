<script setup>
import { ref, onMounted } from 'vue'
import platform from '../platform'

const currentLyric = ref('Desktop Lyric')
const currentTrans = ref('')
const currentRoma = ref('')
const isLocked = ref(false)
const isHovering = ref(false)
const isPlaying = ref(false)

// 监听鼠标进入窗口区域
function onMouseEnter() {
  isHovering.value = true
}

// 监听鼠标离开窗口区域
function onMouseLeave() {
  isHovering.value = false
}

// 锁定/解锁
function toggleLock() {
  // 发送给主进程切换锁定状态
  // 注意：主进程会处理 setIgnoreMouseEvents，并通过 IPC 回传状态
  platform.send('toggle-desktop-lyric-lock')
}

// 播放控制
function togglePlay() {
  platform.send('music-playing-control')
  isPlaying.value = !isPlaying.value
}

function playPrev() {
  platform.send('music-song-control', 'prev')
}

function playNext() {
  platform.send('music-song-control', 'next')
}

function closeWindow() {
  platform.send('desktop-lyric-control', 'close')
}

// 锁定模式下的交互处理
function onUnlockEnter() {
  if (isLocked.value) {
    // 临时取消鼠标穿透，允许点击
    platform.send('desktop-lyric-set-ignore-mouse', false)
  }
}

function onUnlockLeave() {
  if (isLocked.value) {
    // 恢复鼠标穿透
    platform.send('desktop-lyric-set-ignore-mouse', true, { forward: true })
  }
}

onMounted(() => {
  document.body.style.backgroundColor = 'transparent'
  document.documentElement.style.backgroundColor = 'transparent'
  
  if (platform.isElectron()) {
    platform.on('lyric-time-update', (data) => {
      currentLyric.value = data.text || '...'
      currentTrans.value = data.trans || ''
      currentRoma.value = data.romalrc || ''
    })

    platform.on('desktop-lyric-lock-state', (locked) => {
      isLocked.value = locked
    })
    
    // 监听播放状态（如果有这个 IPC）
    // platform.on('music-playing-state', (playing) => { isPlaying.value = playing })
  }
})

// JS 拖拽逻辑
let isDragging = false
let startX = 0
let startY = 0

function onMouseDown(e) {
  // 如果锁定了，或者是点击了按钮（按钮会阻止冒泡，但为了保险），则不拖拽
  if (isLocked.value || e.target.closest('.btn') || e.target.closest('.unlock-btn')) return
  
  isDragging = true
  startX = e.screenX
  startY = e.screenY
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!isDragging) return
  
  const dx = e.screenX - startX
  const dy = e.screenY - startY
  
  if (dx === 0 && dy === 0) return

  // 更新起始点，避免累积
  startX = e.screenX
  startY = e.screenY
  
  if (platform.isElectron()) {
    platform.moveWindow(dx, dy)
  }
}

function onMouseUp() {
  isDragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div 
    class="lyric-window" 
    :class="{ locked: isLocked, hover: isHovering }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousedown="onMouseDown"
  >
    <!-- 背景层：非锁定时显示 -->
    <div class="background" v-if="!isLocked"></div>

    <!-- 歌词层 -->
    <div class="lyric-content">
      <div class="lrc-main" :data-text="currentLyric">{{ currentLyric }}</div>
      <div class="lrc-sub" v-if="currentTrans || currentRoma">{{ currentTrans || currentRoma }}</div>
    </div>

    <!-- 控制栏：非锁定时，Hover 显示 -->
    <div class="controls" v-if="!isLocked">
      <button class="btn" @click="playPrev" title="上一首">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>
      <button class="btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
        <svg v-if="isPlaying" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="btn" @click="playNext" title="下一首">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
      <div class="divider"></div>
      <button class="btn" @click="toggleLock" title="锁定歌词">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </button>
      <button class="btn close" @click="closeWindow" title="关闭">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- 锁定时的解锁按钮 -->
    <div 
      class="unlock-btn" 
      v-if="isLocked"
      @mouseenter="onUnlockEnter"
      @mouseleave="onUnlockLeave"
      @click="toggleLock"
      title="解锁歌词"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
    </div>
  </div>
</template>

<style scoped>
/* 全局容器 */
.lyric-window {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  user-select: none;
  font-family: 'Inter', 'Noto Sans SC', sans-serif;
}

/* 非锁定时：可拖拽 */
.lyric-window:not(.locked) {
  /* 移除 CSS 拖拽，改用 JS 拖拽，解决事件冲突 */
  /* -webkit-app-region: drag; */
  cursor: grab;
}

.lyric-window:not(.locked):active {
  cursor: grabbing;
}

/* 锁定时：完全穿透，除了交互元素 */
.lyric-window.locked {
  -webkit-app-region: no-drag;
  pointer-events: none; /* 让背景点击穿透 */
}

/* 背景层 */
.background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.0); /* 默认透明 */
  transition: background 0.3s;
  border-radius: 8px;
  pointer-events: none;
}

.lyric-window:hover .background {
  background: rgba(232, 236, 239, 0.8); /* 使用 --bg 颜色 #e8ecef */
  backdrop-filter: blur(4px);
  border: 4px solid #0a0a0a; /* 加粗边框 */
}

/* 歌词内容 */
.lyric-content {
  position: relative;
  z-index: 10;
  text-align: center;
  /* 允许在文字上拖拽，但不允许选中 */
  pointer-events: auto; 
  /* -webkit-app-region: drag; */
  padding: 0 20px;
  transition: transform 0.3s;
}

/* 主歌词 */
.lrc-main {
  font-size: 36px;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 4px;
  /* 统一主页风格：黑色描边，白色或强调色填充 */
  color: #0a0a0a;
  -webkit-text-stroke: 1.5px #fff;
  /* 或者反过来：白色文字，黑色描边 */
  color: #fff;
  -webkit-text-stroke: 3px #0a0a0a; /* 加粗文字描边 */
  paint-order: stroke fill;
  
  /* 移除之前的渐变和阴影，改用硬朗的工业风 */
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  -webkit-text-fill-color: #fff;
  filter: drop-shadow(5px 5px 0px rgba(0,0,0,1)); /* 加深投影 */
}

/* 为了增强可读性，可以使用 data-text 属性生成一层描边 */
.lrc-main::before {
  content: none; /* 移除之前的伪元素 */
}

/* 副歌词 */
.lrc-sub {
  font-size: 18px;
  font-weight: 600;
  color: #0a0a0a;
  -webkit-text-stroke: 1px #fff;
  paint-order: stroke fill;
  text-shadow: 2px 2px 0px #fff;
}

/* 控制栏 */
.controls {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #0a0a0a; /* --black */
  border: 4px solid #0a0a0a; /* 加粗控制栏边框 */
  border-radius: 0; /* 移除圆角，符合工业风 */
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: auto; /* 允许点击 */
  -webkit-app-region: no-drag; /* 按钮区域不可拖拽 */
  z-index: 20;
  box-shadow: 6px 6px 0px rgba(0,0,0,0.2); /* 加深阴影 */
}

.lyric-window:hover .controls {
  opacity: 1;
  transform: translate(-50%, 20px); /* 下移一点，避开文字 */
}

/* 按钮样式 */
.btn {
  background: #fff; /* --white */
  border: 2px solid #0a0a0a;
  color: #0a0a0a;
  cursor: pointer;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 0; /* 方形按钮 */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.btn:hover {
  background: #4ade80; /* --accent */
  transform: translate(-2px, -2px);
  box-shadow: 2px 2px 0px #0a0a0a;
}

.btn:active {
  transform: translate(0, 0);
  box-shadow: none;
}

.btn.close:hover {
  background: #ff4d4f;
  color: #fff;
}

.divider {
  width: 2px;
  height: 24px;
  background: #fff;
  margin: 0 4px;
}

/* 锁定时的解锁按钮 */
.unlock-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  background: #0a0a0a;
  border: 2px solid #fff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto; /* 关键：允许点击 */
  -webkit-app-region: no-drag;
  transition: all 0.2s;
  opacity: 0; /* 默认隐藏，hover 时显示 */
  box-shadow: 2px 2px 0px rgba(255,255,255,0.5);
}

/* 当整个窗口 hover 时显示解锁按钮（即使是锁定的） */
/* 注意：锁定时窗口是 ignoreMouseEvents 的，所以窗口本身不会 hover */
/* 但是！因为 forward: true，当鼠标移动到窗口区域时，依然会触发 mouseenter */
/* 这里的 :hover 是指 .unlock-btn 的 hover */
.lyric-window.locked:hover .unlock-btn {
    opacity: 1; /* 只有鼠标真正移动到解锁按钮附近才显示？ */
    /* 由于父级 pointer-events: none，可能无法触发父级 hover */
    /* 但是 unlock-btn 是 pointer-events: auto，所以鼠标移到它上面会触发 */
}

/* 实际上，我们需要让 unlock-btn 一直有一点点可见性，或者依赖 forward 的 mouseenter */
.unlock-btn {
  opacity: 0.3; /* 微弱可见 */
}

.unlock-btn:hover {
  opacity: 1;
  background: #4ade80;
  color: #0a0a0a;
  border-color: #0a0a0a;
  box-shadow: 2px 2px 0px #fff;
}
</style>
