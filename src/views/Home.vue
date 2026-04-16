<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'

import HomeFooter from '../components/home/HomeFooter.vue'
import HomeHeader from '../components/home/HomeHeader.vue'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeWorkspace from '../components/home/HomeWorkspace.vue'
import { useHomeBrandPlacement } from '../composables/useHomeBrandPlacement'
import { useHomePage } from '../composables/useHomePage'

const ErrorToast = defineAsyncComponent(() => import('../components/ErrorToast.vue'))
const LyricDisplay = defineAsyncComponent(() => import('../components/LyricDisplay.vue'))
const Player = defineAsyncComponent(() => import('../components/Player.vue'))
const Playlist = defineAsyncComponent(() => import('../components/Playlist.vue'))
const Toast = defineAsyncComponent(() => import('../components/Toast.vue'))

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
const { brandPlacement } = useHomeBrandPlacement()

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
  <div
    class="window"
    :class="{ 'compact-mode': playerStore.isCompact, 'sidebar-collapsed': !playerStore.isCompact }"
  >
    <HomeHeader
      :show-brand="brandPlacement === 'header'"
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
      <HomeSidebar
        class="sidebar-panel"
        :collapsed="!playerStore.isCompact"
        :show-brand="brandPlacement === 'sidebar'"
      />

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
  --sidebar-width: 236px;
  --player-width: 350px;
  --collapsed-sidebar-width: 82px;
  flex: 1;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  min-height: 0;
  transition: grid-template-columns 0.3s ease;
}

.window.sidebar-collapsed .main {
  grid-template-columns: var(--collapsed-sidebar-width) var(--player-width) minmax(0, 1fr);
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

.sidebar-panel {
  min-width: 0;
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
    --player-width: 280px;
    --collapsed-sidebar-width: 92px;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }

  .left-panel {
    border-right: 2px solid var(--black);
    min-width: 0;
  }

  .window.sidebar-collapsed .main {
    grid-template-columns: var(--collapsed-sidebar-width) var(--player-width) minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .main {
    --sidebar-width: minmax(168px, 220px);
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }

  .left-panel {
    display: none;
  }

  .window.sidebar-collapsed .main {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
}
</style>
