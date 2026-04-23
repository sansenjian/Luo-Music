<script setup lang="ts">
import HomeMediaHero from '@/components/home/media/HomeMediaHero.vue'
import HomeMediaPanelShell from '@/components/home/media/HomeMediaPanelShell.vue'
import HomeMediaSongsSection from '@/components/home/media/HomeMediaSongsSection.vue'
import HomeMediaState from '@/components/home/media/HomeMediaState.vue'
import HomeMediaToolbar from '@/components/home/media/HomeMediaToolbar.vue'
import AlbumDetailPanel from '@/components/user/AlbumDetailPanel.vue'
import FavoriteAlbumsView from '@/components/user/FavoriteAlbumsView.vue'
import type { HomeLikedSongsPanelModel } from '@/composables/home/useHomeLikedSongsPanel'

const props = defineProps<{
  model: HomeLikedSongsPanelModel
}>()

const {
  albumDetailError,
  albumDetailLoading,
  albumCount,
  albums,
  albumsError,
  albumsErrorMessage,
  albumsLoading,
  clearSearch,
  coverUrl,
  currentSongId,
  error,
  filteredAlbums,
  filteredPlaybackSongs,
  handlePrimaryAction,
  hasMore,
  heroKicker,
  isAlbumsSectionActive,
  isSongsSectionActive,
  loadMoreLikedSongs,
  loading,
  loadingMore,
  mediaSongs,
  closeAlbumDetail,
  openAlbumDetail,
  playAlbum,
  playAlbumTrackAt,
  playLikedSongsAt,
  playingAlbumId,
  primaryActionDisabled,
  primaryActionLabel,
  retryAlbumDetail,
  retryLoadAlbums,
  retryLoadLikedSongs,
  searchHint,
  searchQuery,
  selectSection,
  selectedAlbum,
  selectedAlbumId,
  selectedAlbumSongs,
  shouldShowAlbumsLoginGate,
  shouldShowLoginGate,
  songsErrorMessage,
  totalSongCountLabel,
  userMetaLabel,
  userStore
} = props.model
</script>

<template>
  <HomeMediaPanelShell :empty="shouldShowLoginGate">
    <template #empty>
      <HomeMediaState
        class="liked-empty-state"
        title="登录后查看我的喜欢"
        description="侧边栏的“我的喜欢”会与用户中心同步展示。"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z" />
          </svg>
        </template>
      </HomeMediaState>
    </template>

    <template #hero>
      <HomeMediaHero
        :kicker="heroKicker"
        title="我的喜欢"
        :cover-url="coverUrl"
        :cover-alt="'我的喜欢封面'"
        :cover-shell-class="'liked-cover'"
        :cover-fallback-class="'liked-cover-fallback'"
        :avatar-url="userStore.avatarUrl"
        :avatar-alt="userStore.nickname || '用户头像'"
        :avatar-fallback-label="userStore.nickname?.charAt(0) || '我'"
        :meta-label="userMetaLabel"
        :count-label="totalSongCountLabel"
        :primary-action-label="primaryActionLabel"
        :primary-action-disabled="primaryActionDisabled"
        @primary-action="handlePrimaryAction"
      >
        <template #cover-overlay>
          <div class="liked-cover-heart" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z" />
            </svg>
          </div>
        </template>
      </HomeMediaHero>
    </template>

    <template #toolbar>
      <HomeMediaToolbar
        :search-query="searchQuery"
        :inline-message="
          isSongsSectionActive && error && mediaSongs.length > 0
            ? songsErrorMessage
            : isAlbumsSectionActive && albumsError && albums.length > 0
              ? albumsErrorMessage
              : null
        "
        :inline-action-label="
          isSongsSectionActive && error && mediaSongs.length > 0
            ? '重试'
            : isAlbumsSectionActive && albumsError && albums.length > 0
              ? '重试'
              : null
        "
        :search-hint="searchHint"
        @update:search-query="value => (searchQuery = value)"
        @clear-search="clearSearch"
        @inline-action="isSongsSectionActive ? retryLoadLikedSongs() : retryLoadAlbums()"
      >
        <template #tabs>
          <button
            type="button"
            class="subtab"
            :class="{ active: isSongsSectionActive }"
            @click="selectSection('songs')"
          >
            歌曲 {{ mediaSongs.length }}
          </button>
          <button
            type="button"
            class="subtab"
            :class="{ active: isAlbumsSectionActive }"
            @click="selectSection('albums')"
          >
            专辑 {{ albumsLoading && albumCount === 0 ? '...' : albumCount }}
          </button>
          <button type="button" class="subtab" disabled>MV</button>
        </template>
      </HomeMediaToolbar>
    </template>

    <HomeMediaSongsSection
      v-if="isSongsSectionActive"
      :songs="filteredPlaybackSongs"
      :active-song-id="currentSongId"
      :loading="loading"
      :error-message="songsErrorMessage"
      :show-error-state="Boolean(error && mediaSongs.length === 0)"
      :empty-description="searchQuery ? '没有找到匹配的歌曲。' : '暂无喜欢歌曲。'"
      :has-more="hasMore"
      :loading-more="loadingMore || (loading && mediaSongs.length > 0)"
      :show-loading-more-hint="true"
      :load-more-enabled="hasMore"
      loading-description="正在载入我的喜欢歌曲。"
      @play-song="playLikedSongsAt"
      @load-more="loadMoreLikedSongs"
      @retry="retryLoadLikedSongs"
    />

    <div v-else class="liked-albums-panel">
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

      <template v-if="shouldShowAlbumsLoginGate">
        <HomeMediaState
          class="liked-content-state"
          variant="card"
          description="登录后查看收藏专辑。"
        />
      </template>
      <template v-else-if="albumsLoading && albums.length === 0">
        <HomeMediaState
          class="liked-content-state"
          variant="card"
          description="正在载入收藏专辑。"
        />
      </template>
      <template v-else-if="albumsError && albums.length === 0">
        <HomeMediaState
          class="liked-content-state"
          variant="card"
          tone="error"
          :description="albumsErrorMessage"
          action-label="重试"
          @action="retryLoadAlbums"
        />
      </template>
      <template v-else-if="!shouldShowAlbumsLoginGate">
        <HomeMediaState
          v-if="filteredAlbums.length === 0"
          class="liked-search-empty"
          :description="searchQuery ? '没有找到匹配的专辑。' : '暂无收藏专辑。'"
        />

        <FavoriteAlbumsView
          v-else
          :albums="filteredAlbums"
          :loading="albumsLoading"
          :playing-album-id="playingAlbumId"
          interactive
          @album-open="openAlbumDetail"
          @album-play="playAlbum"
        />
      </template>
    </div>
  </HomeMediaPanelShell>
</template>

<style scoped>
.liked-cover {
  background: linear-gradient(135deg, #1f8ca3, #5fd1e4);
}

.liked-cover-fallback {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #0b8097, #5fd1e4 68%, #b9f3ff);
}

.liked-cover-heart {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}

.liked-cover-heart svg {
  display: block;
  width: 78px;
  height: 78px;
  fill: currentColor;
}

.liked-albums-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 8px;
}
</style>
