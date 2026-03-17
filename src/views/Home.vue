<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import HomeFooter from '../components/home/HomeFooter.vue'
import HomeHeader from '../components/home/HomeHeader.vue'
import HomeWorkspace from '../components/home/HomeWorkspace.vue'
import { useHomePage } from '../composables/useHomePage'

const LyricDisplay = defineAsyncComponent(() => import('../components/LyricDisplay.vue'))
const Player = defineAsyncComponent(() => import('../components/Player.vue'))
const Playlist = defineAsyncComponent(() => import('../components/Playlist.vue'))
const Toast = defineAsyncComponent(() => import('../components/Toast.vue'))
const ErrorToast = defineAsyncComponent(() => import('../components/ErrorToast.vue'))

const {
  activeTab,
  closeWindow,
  isElectron,
  maximizeWindow,
  minimizeWindow,
  onSearch,
  playSong,
  playerStore,
  searchKeyword,
  selectedServer,
  selectedServerLabel,
  selectServer,
  servers,
  setSearchKeyword,
  showSelect,
  switchTab,
  toggleSelect,
  isLoading
} = useHomePage()
</script>

<template>
  <div class="window" :class="{ 'compact-mode': playerStore.isCompact }">
    <HomeHeader
      :is-electron="isElectron"
      :is-loading="isLoading"
      :search-keyword="searchKeyword"
      :selected-server="selectedServer"
      :selected-server-label="selectedServerLabel"
      :servers="servers"
      :show-select="showSelect"
      @close-window="closeWindow"
      @maximize-window="maximizeWindow"
      @minimize-window="minimizeWindow"
      @search="onSearch"
      @search-keyword-change="setSearchKeyword"
      @select-server="selectServer"
      @toggle-select="toggleSelect"
    />

    <main class="main">
      <section class="left-panel">
        <Player :loading="playerStore.loading" />
      </section>

      <HomeWorkspace :active-tab="activeTab" @change-tab="switchTab">
        <template #lyric>
          <LyricDisplay :active="activeTab === 'lyric'" />
        </template>
        <template #playlist>
          <Playlist @play-song="playSong" />
        </template>
      </HomeWorkspace>
    </main>

    <HomeFooter
      :is-compact="playerStore.isCompact"
      :is-loading="playerStore.loading"
      :track-count="playerStore.songList.length"
    >
      <template #compact-player>
        <Player :loading="playerStore.loading" :compact="true" />
      </template>
    </HomeFooter>

    <Toast />
    <ErrorToast />
  </div>
</template>

<style scoped>
.window {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main {
  flex: 1;
  display: grid;
  grid-template-columns: 350px 1fr;
  min-height: 0;
  transition: grid-template-columns 0.3s ease;
}

.window.compact-mode .main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  grid-template-columns: 1fr;
}

.window.compact-mode .left-panel {
  display: none;
}

.window.compact-mode {
  justify-content: space-between;
  background: var(--bg);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.left-panel {
  border-right: 3px solid var(--black);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--white);
  z-index: 10;
}

@media (max-width: 900px) {
  .main {
    grid-template-columns: 260px 1fr;
  }

  .left-panel {
    border-right: 2px solid var(--black);
    min-width: 0;
  }
}

@media (max-width: 768px) {
  .main {
    grid-template-columns: 200px 1fr;
  }
}
</style>
