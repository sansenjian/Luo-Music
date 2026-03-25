<script setup lang="ts">
import { onMounted, ref } from 'vue'

import ErrorToast from '../components/ErrorToast.vue'
import HomeFooter from '../components/home/HomeFooter.vue'
import HomeHeader from '../components/home/HomeHeader.vue'
import HomeWorkspace from '../components/home/HomeWorkspace.vue'
import LyricDisplay from '../components/LyricDisplay.vue'
import Player from '../components/Player.vue'
import Playlist from '../components/Playlist.vue'
import Toast from '../components/Toast.vue'
import { useHomePage } from '../composables/useHomePage'

const {
  activeTab,
  closeWindow,
  closeSelect,
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

const isCoreMounted = ref(false)

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      isCoreMounted.value = true
    })
    return
  }

  setTimeout(() => {
    isCoreMounted.value = true
  }, 0)
})
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
      @close-select="closeSelect"
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
        <Player v-if="isCoreMounted" :loading="playerStore.loading" />
        <div v-else class="panel-placeholder" aria-hidden="true"></div>
      </section>

      <HomeWorkspace :active-tab="activeTab" @change-tab="switchTab">
        <template #lyric>
          <LyricDisplay v-if="isCoreMounted" :active="activeTab === 'lyric'" />
          <div v-else class="workspace-placeholder" aria-hidden="true"></div>
        </template>
        <template #playlist>
          <Playlist v-if="isCoreMounted" @play-song="playSong" />
        </template>
      </HomeWorkspace>
    </main>

    <HomeFooter
      :is-compact="playerStore.isCompact"
      :is-loading="playerStore.loading"
      :track-count="playerStore.songList.length"
    >
      <template #compact-player>
        <Player v-if="isCoreMounted" :loading="playerStore.loading" :compact="true" />
        <div v-else class="compact-placeholder" aria-hidden="true"></div>
      </template>
    </HomeFooter>

    <Toast v-if="isCoreMounted" />
    <ErrorToast v-if="isCoreMounted" />
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

.panel-placeholder,
.workspace-placeholder,
.compact-placeholder {
  position: relative;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.015)),
    repeating-linear-gradient(
      -45deg,
      rgba(0, 0, 0, 0.025),
      rgba(0, 0, 0, 0.025) 8px,
      transparent 8px,
      transparent 16px
    );
}

.panel-placeholder {
  flex: 1;
  min-height: 0;
}

.workspace-placeholder {
  flex: 1;
  min-height: 0;
}

.compact-placeholder {
  height: 100%;
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
