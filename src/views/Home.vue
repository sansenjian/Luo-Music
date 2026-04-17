<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'

import HomeFooter from '../components/home/HomeFooter.vue'
import HomeHeader from '../components/home/HomeHeader.vue'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeWorkspace from '../components/home/HomeWorkspace.vue'
import { useDockedPlayerBarLayout } from '../composables/useDockedPlayerBarLayout'
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
const { dockedPlayerBarLayout } = useDockedPlayerBarLayout()
const usesAdaptiveSidebarFooterLayout = computed(
  () => playerStore.isPlayerDocked && dockedPlayerBarLayout.value === 'with-sidebar'
)

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
    :class="{
      'player-docked': playerStore.isPlayerDocked,
      'sidebar-collapsed': !playerStore.isPlayerDocked,
      'footer-with-sidebar': usesAdaptiveSidebarFooterLayout
    }"
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

    <main class="app-shell">
      <HomeSidebar
        class="sidebar-panel"
        :collapsed="!playerStore.isPlayerDocked"
        :show-brand="brandPlacement === 'sidebar'"
      />

      <section class="left-panel">
        <Player v-if="isCoreMounted" :loading="playerStore.loading" />
        <div v-else class="panel-placeholder" aria-hidden="true"></div>
      </section>

      <HomeWorkspace class="workspace-panel" :active-tab="activeTab" @change-tab="switchTab">
        <template #lyric>
          <LyricDisplay v-if="isCoreMounted" :active="activeTab === 'lyric'" />
          <div v-else class="workspace-placeholder" aria-hidden="true"></div>
        </template>
        <template #playlist>
          <Playlist v-if="isCoreMounted" @play-song="playSong" />
        </template>
      </HomeWorkspace>

      <HomeFooter
        class="footer-panel"
        :is-player-docked="playerStore.isPlayerDocked"
        :is-loading="playerStore.loading"
        :track-count="playerStore.songList.length"
        :docked-player-bar-layout="dockedPlayerBarLayout"
      >
        <template #docked-player>
          <Player v-if="isCoreMounted" :loading="playerStore.loading" :docked="true" />
          <div v-else class="docked-player-placeholder" aria-hidden="true"></div>
        </template>
      </HomeFooter>
    </main>

    <Toast v-if="isCoreMounted" />
    <ErrorToast v-if="isCoreMounted" />
  </div>
</template>

<style scoped>
.window {
  --home-sidebar-width: 236px;
  --home-player-width: 350px;
  --home-collapsed-sidebar-width: 82px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-shell {
  flex: 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-columns: var(--home-sidebar-width) minmax(0, 1fr);
  min-height: 0;
  grid-template-areas:
    'sidebar workspace'
    'footer footer';
  transition:
    grid-template-columns 0.3s ease,
    grid-template-areas 0.3s ease;
}

.window.player-docked.footer-with-sidebar .app-shell {
  grid-template-areas:
    'sidebar workspace'
    'sidebar footer';
}

.window.sidebar-collapsed .app-shell {
  grid-template-columns:
    var(--home-collapsed-sidebar-width)
    var(--home-player-width)
    minmax(0, 1fr);
  grid-template-areas:
    'sidebar player workspace'
    'footer footer footer';
}

.window.player-docked .left-panel {
  display: none;
}

.window.player-docked {
  justify-content: space-between;
  background: var(--bg);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.left-panel {
  grid-area: player;
  border-right: 3px solid var(--black);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--white);
  z-index: 10;
}

.sidebar-panel {
  grid-area: sidebar;
  min-width: 0;
  min-height: 0;
}

.workspace-panel {
  grid-area: workspace;
  min-width: 0;
  min-height: 0;
}

.footer-panel {
  grid-area: footer;
  min-width: 0;
}

.panel-placeholder,
.workspace-placeholder,
.docked-player-placeholder {
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

.docked-player-placeholder {
  height: 100%;
}

@media (max-width: 900px) {
  .window {
    --home-player-width: 280px;
    --home-collapsed-sidebar-width: 92px;
  }

  .app-shell {
    grid-template-columns: var(--home-sidebar-width) minmax(0, 1fr);
  }

  .left-panel {
    border-right: 2px solid var(--black);
    min-width: 0;
  }

  .window.sidebar-collapsed .app-shell {
    grid-template-columns:
      var(--home-collapsed-sidebar-width)
      var(--home-player-width)
      minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .window {
    --home-sidebar-width: clamp(168px, 32vw, 220px);
  }

  .app-shell {
    grid-template-columns: var(--home-sidebar-width) minmax(0, 1fr);
    grid-template-areas:
      'sidebar workspace'
      'footer footer';
  }

  .left-panel {
    display: none;
  }

  .window.sidebar-collapsed .app-shell {
    grid-template-columns: var(--home-sidebar-width) minmax(0, 1fr);
    grid-template-areas:
      'sidebar workspace'
      'footer footer';
  }

  .window.player-docked.footer-with-sidebar .app-shell {
    grid-template-areas:
      'sidebar workspace'
      'footer footer';
  }
}
</style>
