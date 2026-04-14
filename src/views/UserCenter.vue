<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import { useUserCenterPage } from '@/composables/useUserCenterPage'

const UserProfileHeader = defineAsyncComponent(
  () => import('../components/user/UserProfileHeader.vue')
)
const LikedSongsView = defineAsyncComponent(() => import('../components/user/LikedSongsView.vue'))
const PlaylistsView = defineAsyncComponent(() => import('../components/user/PlaylistsView.vue'))
const FavoriteAlbumsView = defineAsyncComponent(
  () => import('../components/user/FavoriteAlbumsView.vue')
)
const EventsView = defineAsyncComponent(() => import('../components/user/EventsView.vue'))
const PlaylistDetailPanel = defineAsyncComponent(
  () => import('../components/user/PlaylistDetailPanel.vue')
)
const AlbumDetailPanel = defineAsyncComponent(
  () => import('../components/user/AlbumDetailPanel.vue')
)

const {
  activeTab,
  activeTabError,
  albumDetailError,
  albumDetailLoading,
  albums,
  avatarUrl,
  closeAlbumDetail,
  closePlaylistDetail,
  currentUserId,
  eventsError,
  eventsFilter,
  eventsHasMore,
  eventsLoadingMore,
  formattedSongs,
  filteredEvents,
  favoritePlaylists,
  goBack,
  likedSongsHasMore,
  likedSongsError,
  likedSongsLoadingMore,
  loadingMap,
  loadMoreLikedSongs,
  loadMoreEvents,
  mountedTabs,
  nickname,
  openAlbumDetail,
  openPlaylistDetail,
  playAlbum,
  playAlbumTrackAt,
  playEventSong,
  playlistDetailError,
  playlistDetailLoading,
  playlists,
  playPlaylistTrackAt,
  playAllLikedSongs,
  playLikedSongAt,
  playPlaylist,
  retryActiveTab,
  retryAlbumDetail,
  retryLoadEvents,
  retryLoadLikedSongs,
  retryPlaylistDetail,
  selectedAlbum,
  selectedAlbumId,
  selectedAlbumSongs,
  selectedPlaylist,
  selectedPlaylistId,
  selectedPlaylistSongs,
  setEventsFilter,
  switchTab,
  tabCounts
} = useUserCenterPage()
</script>

<template>
  <div class="user-center-page">
    <div class="user-center-header">
      <button class="back-btn" @click="goBack">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5"></path>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回
      </button>
    </div>

    <div class="user-center-content">
      <UserProfileHeader
        v-if="currentUserId !== null"
        :user-id="currentUserId"
        :avatar-url="avatarUrl"
        :nickname="nickname"
      />

      <section class="content-section">
        <div class="section-header">
          <div class="tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'liked' }"
              @click="switchTab('liked')"
            >
              我喜欢的音乐
              <span v-if="tabCounts.liked > 0" class="count">{{ tabCounts.liked }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'playlist' }"
              @click="switchTab('playlist')"
            >
              歌单
              <span v-if="tabCounts.playlist > 0" class="count">{{ tabCounts.playlist }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'album' }"
              @click="switchTab('album')"
            >
              我的收藏
              <span v-if="tabCounts.album > 0" class="count">{{ tabCounts.album }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'events' }"
              @click="switchTab('events')"
            >
              动态
              <span v-if="tabCounts.events > 0" class="count">{{ tabCounts.events }}</span>
            </button>
          </div>
        </div>

        <div v-if="activeTabError" class="tab-status tab-status-error" role="alert">
          <div>
            <strong>当前内容加载失败</strong>
            <p>请重试当前分页内容。</p>
          </div>
          <button type="button" class="status-action" @click="retryActiveTab">重新加载</button>
        </div>

        <LikedSongsView
          v-if="mountedTabs.liked"
          v-show="activeTab === 'liked'"
          :like-songs="formattedSongs"
          :error="likedSongsError"
          :has-more="likedSongsHasMore"
          :loading="loadingMap.liked"
          :loading-more="likedSongsLoadingMore"
          @load-more="loadMoreLikedSongs"
          @play-all="playAllLikedSongs"
          @play-song="playLikedSongAt"
          @retry="retryLoadLikedSongs"
        />

        <PlaylistsView
          v-if="mountedTabs.playlist"
          v-show="activeTab === 'playlist'"
          :playlists="playlists"
          :loading="loadingMap.playlist"
          :active-playlist-id="selectedPlaylistId"
          @playlist-open="openPlaylistDetail"
          @playlist-play="playPlaylist"
        />

        <PlaylistDetailPanel
          v-if="activeTab === 'playlist' && selectedPlaylistId"
          :playlist="selectedPlaylist"
          :songs="selectedPlaylistSongs"
          :loading="playlistDetailLoading"
          :error="playlistDetailError"
          @close="closePlaylistDetail"
          @retry="retryPlaylistDetail"
          @play-all="playPlaylist(selectedPlaylistId)"
          @play-song="playPlaylistTrackAt"
        />

        <div v-if="mountedTabs.album" v-show="activeTab === 'album'">
          <div class="collection-sections">
            <section class="collection-section">
              <div class="collection-section-header">
                <h3 class="collection-section-title">收藏歌单</h3>
              </div>
              <PlaylistsView
                :playlists="favoritePlaylists"
                :loading="loadingMap.album"
                @playlist-open="openPlaylistDetail"
                @playlist-play="playPlaylist"
              />
            </section>

            <section class="collection-section">
              <div class="collection-section-header">
                <h3 class="collection-section-title">收藏专辑</h3>
              </div>
              <FavoriteAlbumsView
                :albums="albums"
                :loading="loadingMap.album"
                :active-album-id="selectedAlbumId"
                @album-open="openAlbumDetail"
                @album-play="playAlbum"
              />

              <AlbumDetailPanel
                v-if="selectedAlbumId"
                :album="selectedAlbum"
                :songs="selectedAlbumSongs"
                :loading="albumDetailLoading"
                :error="albumDetailError"
                @close="closeAlbumDetail"
                @retry="retryAlbumDetail"
                @play-all="playAlbum(selectedAlbumId)"
                @play-song="playAlbumTrackAt"
              />
            </section>
          </div>
        </div>

        <EventsView
          v-if="mountedTabs.events"
          v-show="activeTab === 'events'"
          :events="filteredEvents"
          :active-filter="eventsFilter"
          :error="eventsError"
          :has-more="eventsHasMore"
          :loading="loadingMap.events"
          :loading-more="eventsLoadingMore"
          @load-more="loadMoreEvents"
          @play-song="playEventSong"
          @retry="retryLoadEvents"
          @update:filter="setEventsFilter"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.user-center-page {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.user-center-header {
  padding: 12px 20px;
  background: var(--white);
  border-bottom: 2px solid var(--black);
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--white);
  border: 2px solid var(--black);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
  transition: all 0.15s;
}

.back-btn:hover {
  background: var(--black);
  color: var(--white);
}

.user-center-content {
  flex: 1;
  overflow-y: auto;
}

.content-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px 40px;
}

.section-header {
  margin-bottom: 24px;
}

.tab-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px 18px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  box-shadow: 4px 4px 0 var(--black);
}

.tab-status-error {
  background: #fff0eb;
}

.tab-status strong {
  display: block;
  font-size: 14px;
  color: var(--black);
}

.tab-status p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--gray);
}

.status-action {
  flex-shrink: 0;
  padding: 10px 16px;
  border: 2px solid var(--black);
  border-radius: 8px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.status-action:hover {
  background: var(--black);
  color: var(--white);
}

.tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-dark);
  padding: 4px;
  border-radius: 12px;
  border: 2px solid var(--black);
  width: fit-content;
}

.collection-sections {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.collection-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.collection-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.collection-section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--black);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--gray);
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover {
  color: var(--black);
  background: rgba(0, 0, 0, 0.05);
}

.tab-btn.active {
  background: var(--white);
  color: var(--black);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tab-btn .count {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  font-weight: 700;
}

.tab-btn.active .count {
  background: var(--accent);
  color: var(--white);
}

@media (max-width: 768px) {
  .tab-status {
    flex-direction: column;
    align-items: stretch;
  }

  .tabs {
    width: 100%;
    border-radius: 10px;
    flex-wrap: wrap;
  }

  .tab-btn {
    flex: 1 1 calc(50% - 4px);
    justify-content: center;
    padding: 10px 12px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .user-center-header {
    padding: 10px 16px;
  }

  .content-section {
    padding: 0 16px 32px;
  }

  .tab-btn {
    padding: 8px 10px;
    font-size: 12px;
  }
}
</style>
