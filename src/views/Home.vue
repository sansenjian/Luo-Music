<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { useToastStore } from '../store/toastStore'
import { useSearch } from '../composables/useSearch'
import Player from '../components/Player.vue'
import Lyric from '../components/Lyric.vue'
import Playlist from '../components/Playlist.vue'
import Toast from '../components/Toast.vue'

// 使用 contextBridge 暴露的 API，不再直接 require('electron')
// const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null }

const playerStore = usePlayerStore()
const toastStore = useToastStore()
const { searchKeyword, loading, handleSearch } = useSearch()

const activeTab = ref('lyric')

async function onSearch() {
  const success = await handleSearch()
  if (success) {
    activeTab.value = 'playlist'
  }
}

async function playSong(index) {
  try {
    await playerStore.playSongWithDetails(index)
    activeTab.value = 'lyric'
  } catch (error) {
    toastStore.error('Playback failed. Please try again.')
  }
}

function switchTab(tab) {
  activeTab.value = tab
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    // Prevent default behavior if needed (e.g. closing full screen)
    // e.preventDefault()
    playerStore.toggleCompactMode()
    
    // Resize window based on mode
    /* User requested NOT to resize to mini bar, just change layout inside the window.
       If we previously implemented resizing, we should revert it or make it optional.
       The user said "不要缩小为长条状挂件", so we keep the window size but change the content layout.
    */
    /* 
    if (playerStore.isCompact) {
      ipcRenderer?.send('resize-window', { width: 800, height: 80 })
    } else {
      ipcRenderer?.send('resize-window', { width: 1200, height: 800 })
    }
    */
    
    console.log('Toggled compact mode via Escape', playerStore.isCompact)
  }
}

function minimizeWindow() {
  window.electronAPI?.minimizeWindow()
}

function maximizeWindow() {
  window.electronAPI?.maximizeWindow()
}

function closeWindow() {
  window.electronAPI?.closeWindow()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="window" :class="{ 'compact-mode': playerStore.isCompact }">
    <header class="titlebar">
      <div class="title-left">
        <h1 class="logo">LUO // MUSIC</h1>
      </div>
      
      <div class="search-bar">
        <input
          v-model="searchKeyword"
          @keyup.enter="onSearch"
          class="cyber-input"
          type="text"
          placeholder="Search..."
        />
        <button @click="onSearch" class="exec-btn" :disabled="loading">
          <span v-if="loading" class="loading"></span>
          <span v-else>Execute</span>
        </button>
      </div>

      <div class="window-controls">
        <button class="win-btn" @click="minimizeWindow" title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="win-btn" @click="maximizeWindow" title="Maximize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
        </button>
        <button class="win-btn win-close" @click="closeWindow" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </header>

    <main class="main">
      <section class="left-panel">
        <Player :loading="playerStore.loading" />
      </section>

      <section class="right-panel">
        <div class="panel-tabs">
          <button
            @click="switchTab('lyric')"
            class="tab"
            :class="{ active: activeTab === 'lyric' }"
          >
            Lyrics
          </button>
          <button
            @click="switchTab('playlist')"
            class="tab"
            :class="{ active: activeTab === 'playlist' }"
          >
            Playlist
          </button>
        </div>

        <div class="content-area">
          <Lyric v-show="activeTab === 'lyric'" />
          <Playlist v-show="activeTab === 'playlist'" @play-song="playSong" />
        </div>
      </section>
    </main>

    <!-- Compact Mode Player (Footer) -->
    <footer v-if="playerStore.isCompact" class="compact-player">
      <Player :loading="playerStore.loading" :compact="true" />
    </footer>

    <footer v-if="!playerStore.isCompact" class="statusbar">
      <div class="status-left">
        <span>{{ playerStore.songList.length }} Tracks</span>
        <span v-if="playerStore.loading" class="status-loading">Loading...</span>
      </div>
      <div>44.1kHz / 320kbps</div>
    </footer>
    
    <Toast />
  </div>
</template>

<style scoped>
.window {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.titlebar {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    padding-top: calc(12px + var(--safe-top));
    padding-left: calc(20px + var(--safe-left));
    padding-right: calc(20px + var(--safe-right));
    border-bottom: var(--border);
    background: var(--bg);
    flex-shrink: 0;
    transition: all 0.3s ease;
    /* Allow window dragging */
    -webkit-app-region: drag;
  }
  
  /* Elements that should capture clicks instead of dragging */
  .search-bar, .window-controls {
    -webkit-app-region: no-drag;
  }
  
  /* Hide titlebar in compact mode */
  /* Revert hiding titlebar if user wants full window */
  /* .window.compact-mode .titlebar {
    height: 0;
    padding: 0;
    overflow: hidden;
    border-bottom: none;
    opacity: 0;
  } */

  .title-left {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 200px; /* Fixed width to balance layout */
  }

  .logo {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: uppercase;
}

.search-bar {
  display: flex;
  gap: 8px;
  flex: 1;
  max-width: 400px;
  margin: 0 auto; /* Center the search bar */
}

.window-controls {
  display: flex;
  gap: 12px;
  width: 200px; /* Fixed width to balance layout */
  justify-content: flex-end;
}

.win-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--black);
    opacity: 0.8;
  }

.win-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  opacity: 1;
}

.win-close:hover {
    background: #ff4d4f;
    color: white;
    opacity: 1;
  }

.cyber-input {
  flex: 1;
  padding: 8px 10px;
  border: 2px solid var(--black);
  background: var(--white);
  font-family: inherit;
  font-size: 16px;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
}

.cyber-input:focus {
  background: var(--bg);
}

.exec-btn {
  padding: 8px 16px;
  border: 2px solid var(--black);
  background: var(--black);
  color: var(--white);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.1s;
  -webkit-appearance: none;
  border-radius: 0;
  display: flex;
  align-items: center;
}

.exec-btn:hover:not(:disabled), .exec-btn:active:not(:disabled) {
  background: var(--white);
  color: var(--black);
}

.exec-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 调整布局，增加紧凑模式支持 */
.main {
  flex: 1;
  display: grid;
  grid-template-columns: 350px 1fr;
  min-height: 0;
  transition: grid-template-columns 0.3s ease;
}

  /* Compact mode styles for main container */
  .window.compact-mode .main {
    flex: 1;
    display: flex; /* Ensure main takes remaining space */
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    grid-template-columns: 1fr; /* Override grid columns */
  }

  .window.compact-mode .left-panel {
    display: none;
  }

  /* When compact mode is active, make sure right-panel takes full width but has no content issues */
  .window.compact-mode .right-panel {
    border-left: none;
    display: flex; /* Restore display */
    flex: 1;
    width: 100%;
    overflow: hidden;
  }
  
  /* Make sure footer stays at bottom */
  .window.compact-mode {
    /* If we hide main, footer will be at top unless we justify-content */
    justify-content: space-between; /* Keep header at top, footer at bottom */
    background: var(--bg); /* Restore background */
    height: 100%; /* Restore height */
    display: flex;
    flex-direction: column;
  }
  
  /* Remove duplicate block */
  /* .window.compact-mode .main { ... } */

  .window.compact-mode .compact-player {
    background: var(--white);
    border-top: 3px solid var(--black);
    width: 100%;
    height: 80px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .left-panel {
    border-right: 3px solid var(--black);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--white);
    z-index: 10;
  }

  .right-panel {
  background: var(--bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  min-width: 0;
}

.panel-tabs {
  display: flex;
  border-bottom: var(--border);
  flex-shrink: 0;
}

.tab {
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  border: none;
  border-right: var(--border);
  background: var(--bg);
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.1s;
}

.tab.active {
  background: var(--black);
  color: var(--white);
}

.tab:hover:not(.active), .tab:active:not(.active) {
  background: var(--bg-dark);
}

.content-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    padding-bottom: calc(10px + var(--safe-bottom));
    padding-left: calc(20px + var(--safe-left));
    padding-right: calc(20px + var(--safe-right));
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--gray);
    flex-shrink: 0;
    background: var(--bg);
  }

  .compact-player {
    flex-shrink: 0;
    background: var(--white);
    border-top: 3px solid var(--black);
    padding: 0;
    height: 80px; 
    overflow: hidden;
  }
  
  .status-left {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.status-loading {
  color: var(--accent);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 900px) {
  .main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .left-panel {
    border-right: none;
    border-bottom: var(--border);
    max-height: none;
    min-height: auto;
  }

  .titlebar {
    flex-wrap: wrap;
    gap: 12px;
  }

  .search-bar {
    max-width: 100%;
    width: 100%;
  }
}

@media (max-width: 600px) {
  .titlebar {
    padding: 8px 12px;
    padding-top: calc(8px + var(--safe-top));
  }

  .logo {
    font-size: 14px;
  }

  .tab {
    padding: 14px 16px;
    font-size: 12px;
  }
}
</style>
