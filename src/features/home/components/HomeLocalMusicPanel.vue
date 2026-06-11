<script setup lang="ts">
import './local-music/localMusic.css'

import LocalMusicEmptyState from '@/features/home/components/local-music/LocalMusicEmptyState.vue'
import LocalMusicFolderList from '@/features/home/components/local-music/LocalMusicFolderList.vue'
import LocalMusicHero from '@/features/home/components/local-music/LocalMusicHero.vue'
import LocalMusicSongsView from '@/features/home/components/local-music/LocalMusicSongsView.vue'
import LocalMusicSummaryGrid from '@/features/home/components/local-music/LocalMusicSummaryGrid.vue'
import LocalMusicToolbar from '@/features/home/components/local-music/LocalMusicToolbar.vue'
import { useHomeLocalMusicPanel } from '@/features/home/composables/useHomeLocalMusicPanel'

const {
  activeSongScopeLabel,
  activeView,
  albumCards,
  albumsEmptyState,
  artistCards,
  artistsEmptyState,
  clearSearch,
  clearSongScope,
  createLocalPlaylistFromSong,
  currentPageSizeLabel,
  currentSummaryLabel,
  currentViewTitle,
  diagnosticCards,
  folders,
  handleAddFolder,
  handleLoadMore,
  handleRemoveFolder,
  handleRescan,
  handleRescanFolder,
  handleSearchSubmit,
  handleShowFolder,
  handleToggleFolder,
  hasEnabledFolders,
  hasFolders,
  hasMoreForActiveView,
  hasSearchValue,
  hideDuplicateSongs,
  isScanning,
  addLocalSongToPlaylist,
  lastScanLabel,
  loadingEmptyState,
  localPlaylistOptions,
  mutating,
  pageLoading,
  playbackSongs,
  playLocalSongAt,
  rootEmptyState,
  searchDraft,
  selectAlbumCard,
  selectArtistCard,
  setActiveView,
  showDuplicateSongsOnly,
  showLocalSongInFolder,
  songsEmptyState,
  status,
  supported,
  totalFolderLabel,
  totalTrackLabel,
  unsupportedEmptyState,
  updateSearchDraft,
  viewModes,
  showCurrentViewLoading,
  toggleHideDuplicateSongs,
  toggleShowDuplicateSongsOnly
} = useHomeLocalMusicPanel()
</script>

<template>
  <section class="local-panel">
    <LocalMusicEmptyState v-if="!supported" :model="unsupportedEmptyState" />

    <div v-else class="local-shell">
      <LocalMusicHero
        :diagnostic-cards="diagnosticCards"
        :has-enabled-folders="hasEnabledFolders"
        :is-scanning="isScanning"
        :last-scan-label="lastScanLabel"
        :mutating="mutating"
        :status="status"
        :total-folder-label="totalFolderLabel"
        :total-track-label="totalTrackLabel"
        @add-folder="handleAddFolder"
        @rescan="handleRescan"
      />

      <template v-if="hasFolders">
        <LocalMusicFolderList
          :folders="folders"
          :mutating="mutating"
          :total-folder-label="totalFolderLabel"
          @remove-folder="handleRemoveFolder"
          @rescan-folder="handleRescanFolder"
          @show-folder="handleShowFolder"
          @toggle-folder="handleToggleFolder"
        />

        <section class="local-content">
          <LocalMusicToolbar
            :active-view="activeView"
            :current-summary-label="currentSummaryLabel"
            :current-view-title="currentViewTitle"
            :has-search-value="hasSearchValue"
            :search-draft="searchDraft"
            :view-modes="viewModes"
            @clear-search="clearSearch"
            @submit-search="handleSearchSubmit"
            @update:active-view="setActiveView"
            @update:search-draft="updateSearchDraft"
          />

          <LocalMusicEmptyState v-if="showCurrentViewLoading" :model="loadingEmptyState" />

          <LocalMusicSongsView
            v-else-if="activeView === 'songs' || activeView === 'inbox'"
            :active-song-scope-label="activeSongScopeLabel"
            :empty-state="songsEmptyState"
            :footnote-size-label="currentPageSizeLabel"
            :has-more="hasMoreForActiveView"
            :hide-duplicates="hideDuplicateSongs"
            :local-playlists="localPlaylistOptions"
            :page-loading="pageLoading"
            :show-duplicates-only="showDuplicateSongsOnly"
            :songs="playbackSongs"
            @add-to-local-playlist="addLocalSongToPlaylist"
            @clear-scope="clearSongScope"
            @create-local-playlist="createLocalPlaylistFromSong"
            @load-more="handleLoadMore"
            @play-song="playLocalSongAt"
            @show-in-folder="showLocalSongInFolder"
            @toggle-hide-duplicates="toggleHideDuplicateSongs"
            @toggle-show-duplicates-only="toggleShowDuplicateSongsOnly"
          />

          <LocalMusicSummaryGrid
            v-else-if="activeView === 'artists'"
            :cards="artistCards"
            :empty-state="artistsEmptyState"
            :has-more="hasMoreForActiveView"
            :page-loading="pageLoading"
            @load-more="handleLoadMore"
            @select="selectArtistCard"
          />

          <LocalMusicSummaryGrid
            v-else
            :cards="albumCards"
            :empty-state="albumsEmptyState"
            :has-more="hasMoreForActiveView"
            :page-loading="pageLoading"
            @load-more="handleLoadMore"
            @select="selectAlbumCard"
          />
        </section>
      </template>

      <LocalMusicEmptyState v-else :model="rootEmptyState">
        <button
          type="button"
          class="hero-action hero-action-primary"
          :disabled="mutating"
          @click="handleAddFolder"
        >
          选择文件夹
        </button>
      </LocalMusicEmptyState>
    </div>
  </section>
</template>
