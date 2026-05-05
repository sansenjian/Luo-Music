<script setup lang="ts">
import { computed } from 'vue'

import ErrorToast from '@/components/ErrorToast.vue'
import HomeCollectionDetailPanel from '@/components/home/HomeCollectionDetailPanel.vue'
import HomeDiscover from '@/components/home/HomeDiscover.vue'
import HomeFooter from '@/components/home/HomeFooter.vue'
import HomeOverview from '@/components/home/HomeOverview.vue'
import HomeHeader from '@/components/home/HomeHeader.vue'
import HomeLikedSongsPanel from '@/components/home/HomeLikedSongsPanel.vue'
import HomeLocalMusicPanel from '@/components/home/HomeLocalMusicPanel.vue'
import HomePluginsPanel from '@/components/home/HomePluginsPanel.vue'
import HomeRecentPlayPanel from '@/components/home/HomeRecentPlayPanel.vue'
import HomeRoaming from '@/components/home/HomeRoaming.vue'
import HomeSettingsPanel from '@/components/home/HomeSettingsPanel.vue'
import HomeSidebar from '@/components/home/HomeSidebar.vue'
import HomeWorkspace from '@/components/home/HomeWorkspace.vue'
import LyricDisplay from '@/components/LyricDisplay.vue'
import Player from '@/components/Player.vue'
import Playlist from '@/components/Playlist.vue'
import Toast from '@/components/Toast.vue'
import { useDockedPlayerBarLayout } from '@/composables/useDockedPlayerBarLayout'
import { useDeferredMount } from '@/composables/useDeferredMount'
import { useHomeBrandPlacement } from '@/composables/useHomeBrandPlacement'
import { useHomeLikedSongsPanel } from '@/composables/home/useHomeLikedSongsPanel'
import { useHomePage } from '@/composables/useHomePage'
import { useHomeWorkspaceState } from '@/composables/useHomeWorkspaceState'
import { useLocalLibrary } from '@/composables/useLocalLibrary'

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
const {
  activeSidebarItemId,
  activeWorkspaceView,
  canNavigateBack,
  canNavigateForward,
  handleSidebarCollectionSelect,
  handleSidebarItemSelect,
  navigateBack,
  navigateForward,
  showNowPlaying,
  selectedCollection
} = useHomeWorkspaceState()

async function handleSearch(): Promise<void> {
  await onSearch()
  showNowPlaying()
}

function handleNavigateToLyrics(): void {
  switchTab('lyric')
  if (activeWorkspaceView.value !== 'now-playing') {
    showNowPlaying()
  }
}

const sharedLocalLibrary = useLocalLibrary()
const homeLikedSongsPanelModel = useHomeLikedSongsPanel({
  localLibrary: sharedLocalLibrary,
  onOpenCollection: handleSidebarCollectionSelect
})
const { isMounted: isCoreMounted } = useDeferredMount('frame')
const { isMounted: isIdleMounted } = useDeferredMount('idle')
</script>

<template>
  <div
    class="window"
    data-ui="home-window"
    :class="{
      'player-docked': playerStore.isPlayerDocked,
      'sidebar-collapsed': !playerStore.isPlayerDocked,
      'footer-with-sidebar': usesAdaptiveSidebarFooterLayout
    }"
  >
    <HomeHeader
      :show-brand="brandPlacement === 'header'"
      :can-navigate-back="canNavigateBack"
      :can-navigate-forward="canNavigateForward"
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
      @navigate-back="navigateBack"
      @navigate-forward="navigateForward"
      @search="handleSearch"
      @search-keyword-change="setSearchKeyword"
      @select-server="selectServer"
      @toggle-select="toggleSelect"
    />

    <main class="app-shell" data-ui="home-shell">
      <HomeSidebar
        :active-item-id="activeSidebarItemId"
        class="sidebar-panel"
        :collapsed="!playerStore.isPlayerDocked"
        :show-brand="brandPlacement === 'sidebar'"
        @collection-select="handleSidebarCollectionSelect"
        @item-select="handleSidebarItemSelect"
      />

      <section class="left-panel" data-ui="player-panel">
        <Player
          v-if="isCoreMounted"
          :loading="playerStore.loading"
          @navigate-to-lyrics="handleNavigateToLyrics"
        />
        <div v-else class="panel-placeholder" aria-hidden="true"></div>
      </section>

      <HomeOverview
        v-if="activeWorkspaceView === 'home'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeDiscover
        v-else-if="activeWorkspaceView === 'discover'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeRoaming
        v-else-if="activeWorkspaceView === 'roaming'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeWorkspace
        v-else-if="activeWorkspaceView === 'now-playing'"
        class="workspace-panel"
        :active-tab="activeTab"
        @change-tab="switchTab"
      >
        <template #lyric>
          <LyricDisplay v-if="isCoreMounted" :active="activeTab === 'lyric'" />
          <div v-else class="workspace-placeholder" aria-hidden="true"></div>
        </template>
        <template #playlist>
          <Playlist v-if="isCoreMounted" @play-song="playSong" />
        </template>
      </HomeWorkspace>
      <HomeLikedSongsPanel
        v-else-if="activeWorkspaceView === 'liked'"
        class="workspace-panel"
        data-ui="workspace-panel"
        :model="homeLikedSongsPanelModel"
      />
      <HomeRecentPlayPanel
        v-else-if="activeWorkspaceView === 'history'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeLocalMusicPanel
        v-else-if="activeWorkspaceView === 'local'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomePluginsPanel
        v-else-if="activeWorkspaceView === 'plugins'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeSettingsPanel
        v-else-if="activeWorkspaceView === 'settings'"
        class="workspace-panel"
        data-ui="workspace-panel"
      />
      <HomeCollectionDetailPanel
        v-else
        class="workspace-panel"
        data-ui="workspace-panel"
        :collection="selectedCollection"
      />

      <HomeFooter
        class="footer-panel"
        :is-player-docked="playerStore.isPlayerDocked"
        :is-loading="playerStore.loading"
        :track-count="playerStore.songList.length"
        :docked-player-bar-layout="dockedPlayerBarLayout"
      >
        <template #docked-player>
          <Player
            v-if="isCoreMounted"
            :loading="playerStore.loading"
            :docked="true"
            @navigate-to-lyrics="handleNavigateToLyrics"
          />
          <div v-else class="docked-player-placeholder" aria-hidden="true"></div>
        </template>
      </HomeFooter>
    </main>

    <Toast v-if="isIdleMounted" />
    <ErrorToast v-if="isIdleMounted" />
  </div>
</template>

<style scoped>
.window {
  --home-sidebar-width: 236px;
  --home-player-width: 350px;
  --home-collapsed-sidebar-width: 82px;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--ui-app-bg);
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
  transition: grid-template-columns 0.2s ease;
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
  height: 100%;
  display: flex;
  flex-direction: column;
}

.left-panel {
  grid-area: player;
  margin: var(--left-panel-margin, 0);
  border: var(--left-panel-border, 0);
  border-right: var(--left-panel-divider, var(--ui-divider));
  border-radius: var(--left-panel-radius, 0);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--left-panel-bg, var(--ui-surface));
  box-shadow: var(--left-panel-shadow, none);
  z-index: 10;
  overflow: hidden;
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
    border-right: var(--ui-divider);
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
