<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useLikedSongs } from '@/composables/useLikedSongs'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'
import { formatDuration } from '@/utils/songFormatter'

const userStore = useUserStore()
const playerStore = usePlayerStore()
const toastStore = useToastStore()
const {
  count,
  error,
  formattedSongs,
  hasMore,
  likeSongs,
  loadLikedSongs,
  loadMoreLikedSongs,
  loading,
  loadingMore,
  retryLoadLikedSongs,
  resetLikedSongs
} = useLikedSongs()

const searchQuery = ref('')

const normalizedQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase())
const filteredSongs = computed(() => {
  if (!normalizedQuery.value) {
    return formattedSongs.value
  }

  return formattedSongs.value.filter(song => {
    const fields = [song.name, song.artist, song.album]
    return fields.some(field => field.toLocaleLowerCase().includes(normalizedQuery.value))
  })
})

const coverUrl = computed(
  () => filteredSongs.value[0]?.cover || formattedSongs.value[0]?.cover || ''
)
const totalSongCountLabel = computed(() => `${count.value} 首歌曲`)
const userMetaLabel = computed(() =>
  userStore.nickname ? `${userStore.nickname} · 默认喜欢歌单` : '默认喜欢歌单'
)
const errorMessage = computed(() => {
  if (!error.value) {
    return ''
  }

  if (error.value instanceof Error && error.value.message) {
    return error.value.message
  }

  if (typeof error.value === 'string') {
    return error.value
  }

  return '喜欢的音乐加载失败，请稍后重试。'
})
const currentSongId = computed(() => playerStore.currentSong?.id ?? null)

watch(
  () => [userStore.isLoggedIn, userStore.userId] as const,
  ([isLoggedIn, userId]) => {
    if (isLoggedIn && userId !== null && userId !== undefined && userId !== '') {
      void loadLikedSongs(userId)
      return
    }

    resetLikedSongs()
  },
  { immediate: true }
)

async function playLikedSongsAt(index: number): Promise<void> {
  if (loading.value || filteredSongs.value.length === 0) {
    return
  }

  const sourceSong = filteredSongs.value[index]
  if (!sourceSong) {
    return
  }

  const playbackList = filteredSongs.value.map(song => likeSongs.value[song.index]).filter(Boolean)
  const playbackIndex = playbackList.findIndex(song => song.id === sourceSong.id)
  if (playbackIndex === -1) {
    return
  }

  try {
    playerStore.setSongList(playbackList)
    await playerStore.playSongWithDetails(playbackIndex)
  } catch (playbackError) {
    const message =
      playbackError instanceof Error ? playbackError.message : '播放喜欢的音乐时发生错误。'
    toastStore.error(message)
  }
}

function handlePlayAll(): void {
  void playLikedSongsAt(0)
}

function clearSearch(): void {
  searchQuery.value = ''
}
</script>

<template>
  <section class="liked-panel">
    <div v-if="!userStore.isLoggedIn" class="liked-empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z" />
        </svg>
      </div>
      <h2>登录后查看我喜欢的音乐</h2>
      <p>侧边栏的“我喜欢的音乐”会与用户中心同步展示。</p>
    </div>

    <div v-else-if="loading && formattedSongs.length === 0" class="liked-empty-state">
      <div class="empty-icon">♪</div>
      <h2>正在载入我喜欢的音乐</h2>
      <p>稍等片刻，正在同步你的默认喜欢歌单。</p>
    </div>

    <div
      v-else-if="error && formattedSongs.length === 0"
      class="liked-empty-state is-error"
      role="alert"
    >
      <div class="empty-icon">!</div>
      <h2>喜欢的音乐加载失败</h2>
      <p>{{ errorMessage }}</p>
      <button type="button" class="hero-action hero-action-primary" @click="retryLoadLikedSongs">
        重新加载
      </button>
    </div>

    <div v-else class="liked-shell">
      <section class="liked-hero">
        <div class="liked-cover">
          <img v-if="coverUrl" :src="coverUrl" alt="我喜欢的音乐封面" class="liked-cover-image" />
          <div v-else class="liked-cover-image liked-cover-fallback"></div>
          <div class="liked-cover-heart" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z" />
            </svg>
          </div>
        </div>

        <div class="liked-summary">
          <p class="liked-kicker">歌单</p>
          <h1>我喜欢的音乐</h1>
          <div class="liked-meta">
            <img
              v-if="userStore.avatarUrl"
              :src="userStore.avatarUrl"
              :alt="userStore.nickname || '用户头像'"
              class="liked-meta-avatar"
            />
            <span v-else class="liked-meta-avatar fallback">
              {{ userStore.nickname?.charAt(0) || '我' }}
            </span>
            <span class="liked-meta-copy">{{ userMetaLabel }}</span>
            <span class="liked-meta-count">{{ totalSongCountLabel }}</span>
          </div>

          <div class="liked-actions">
            <button type="button" class="hero-action hero-action-primary" @click="handlePlayAll">
              播放全部
            </button>
            <button type="button" class="hero-action" :disabled="filteredSongs.length === 0">
              下载
            </button>
            <button type="button" class="hero-action hero-action-icon" aria-label="更多操作">
              ···
            </button>
          </div>
        </div>
      </section>

      <section class="liked-content">
        <div class="liked-content-header">
          <div class="liked-content-main">
            <div class="liked-subtabs" aria-label="喜欢的音乐分区">
              <button type="button" class="subtab active">歌曲 {{ count }}</button>
              <button type="button" class="subtab" disabled>评论</button>
              <button type="button" class="subtab" disabled>收藏者</button>
            </div>

            <div v-if="error" class="liked-inline-error" role="alert">
              <span>{{ errorMessage }}</span>
              <button type="button" class="inline-action" @click="retryLoadLikedSongs">重试</button>
            </div>
          </div>

          <label class="liked-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input v-model="searchQuery" type="search" placeholder="搜索歌曲、歌手或专辑" />
            <button
              v-if="searchQuery"
              type="button"
              class="search-clear"
              aria-label="清空搜索"
              @click="clearSearch"
            >
              ×
            </button>
          </label>
        </div>

        <div class="liked-table">
          <div class="liked-table-head">
            <span class="col-index">#</span>
            <span class="col-title">标题</span>
            <span class="col-album">专辑</span>
            <span class="col-like">喜欢</span>
            <span class="col-duration">时长</span>
          </div>

          <div v-if="filteredSongs.length === 0" class="liked-search-empty">
            <p>没有找到匹配的歌曲。</p>
          </div>

          <button
            v-for="(song, index) in filteredSongs"
            :key="`${song.id}-${song.index}`"
            type="button"
            class="liked-row"
            :class="{ active: currentSongId === song.id }"
            @click="playLikedSongsAt(index)"
          >
            <span class="col-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="col-title song-primary">
              <img :src="song.cover" :alt="song.name" class="song-cover" />
              <span class="song-copy">
                <strong>{{ song.name }}</strong>
                <span>{{ song.artist }}</span>
              </span>
            </span>
            <span class="col-album">{{ song.album || '单曲' }}</span>
            <span class="col-like">
              <span class="like-indicator" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z"
                  />
                </svg>
              </span>
            </span>
            <span class="col-duration">{{ formatDuration(song.duration * 1000) }}</span>
          </button>

          <div v-if="hasMore" class="liked-load-more">
            <button
              type="button"
              class="hero-action"
              :disabled="loadingMore"
              @click="loadMoreLikedSongs"
            >
              {{ loadingMore ? '加载中...' : '加载更多' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.liked-panel {
  height: 100%;
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.96)), var(--bg);
}

.liked-shell {
  min-height: 100%;
  padding: 34px 34px 40px;
}

.liked-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 28px;
  align-items: end;
}

.liked-cover {
  position: relative;
  width: 180px;
  height: 180px;
  border: 3px solid var(--black);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.12);
  background: linear-gradient(135deg, #1f8ca3, #5fd1e4);
}

.liked-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

.liked-summary {
  min-width: 0;
}

.liked-kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gray);
}

.liked-summary h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.liked-meta {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--gray);
  font-size: 13px;
}

.liked-meta-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid var(--black);
}

.liked-meta-avatar.fallback {
  display: grid;
  place-items: center;
  background: var(--black);
  color: var(--white);
  font-weight: 700;
}

.liked-meta-copy {
  color: var(--black);
  font-weight: 700;
}

.liked-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  flex-wrap: wrap;
}

.hero-action {
  min-height: 42px;
  padding: 10px 18px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.hero-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.hero-action:disabled {
  cursor: wait;
  opacity: 0.6;
}

.hero-action-primary {
  background: var(--accent);
  color: var(--white);
}

.hero-action-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.hero-action-icon {
  min-width: 42px;
  padding-inline: 14px;
}

.liked-content {
  margin-top: 36px;
}

.liked-content-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 8px;
}

.liked-content-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.liked-subtabs {
  display: flex;
  align-items: center;
  gap: 22px;
}

.subtab {
  position: relative;
  padding: 0 0 14px;
  border: 0;
  background: transparent;
  color: var(--gray);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.subtab.active {
  color: var(--black);
}

.subtab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background: var(--accent);
  border-radius: 999px;
}

.subtab:disabled {
  cursor: default;
  opacity: 0.7;
}

.liked-inline-error {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #b42318;
}

.inline-action {
  border: 0;
  background: transparent;
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.liked-search {
  width: min(100%, 280px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 38px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 999px;
  background: var(--white);
  color: var(--gray);
}

.liked-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 13px;
}

.search-clear {
  border: 0;
  background: transparent;
  color: var(--gray);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.liked-table {
  margin-top: 2px;
}

.liked-table-head,
.liked-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 2.3fr) minmax(120px, 1.4fr) 58px 72px;
  gap: 16px;
  align-items: center;
}

.liked-table-head {
  padding: 8px 18px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 700;
}

.liked-row {
  width: 100%;
  padding: 12px 18px;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.liked-row:hover {
  background: rgba(255, 255, 255, 0.68);
}

.liked-row.active {
  background: rgba(255, 255, 255, 0.9);
}

.col-index,
.col-like,
.col-duration {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--gray);
}

.song-primary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.song-cover {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(17, 24, 39, 0.12);
}

.song-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.song-copy strong,
.song-copy span,
.col-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-copy strong {
  font-size: 15px;
  color: var(--black);
}

.song-copy span,
.col-album {
  font-size: 13px;
  color: var(--gray);
}

.like-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ff4259;
}

.like-indicator svg {
  width: 18px;
  height: 18px;
  display: block;
  fill: currentColor;
}

.liked-load-more {
  padding: 18px 0 0;
  display: flex;
  justify-content: center;
}

.liked-search-empty,
.liked-empty-state {
  min-height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 64px 24px;
  color: var(--gray);
}

.liked-empty-state {
  gap: 12px;
}

.liked-empty-state h2 {
  margin: 0;
  color: var(--black);
  font-size: 26px;
}

.liked-empty-state p,
.liked-search-empty p {
  margin: 0;
  font-size: 14px;
}

.liked-empty-state.is-error {
  color: #b42318;
}

.empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: rgba(17, 24, 39, 0.08);
  color: var(--black);
}

.empty-icon svg {
  width: 34px;
  height: 34px;
  display: block;
  fill: currentColor;
}

@media (max-width: 960px) {
  .liked-shell {
    padding: 24px 20px 32px;
  }

  .liked-hero {
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 20px;
  }

  .liked-cover {
    width: 140px;
    height: 140px;
  }
}

@media (max-width: 760px) {
  .liked-hero {
    grid-template-columns: 1fr;
  }

  .liked-cover {
    width: 180px;
    height: 180px;
  }

  .liked-table-head,
  .liked-row {
    grid-template-columns: 38px minmax(0, 1fr) 56px;
  }

  .col-album,
  .liked-table-head .col-album,
  .liked-table-head .col-like,
  .liked-row .col-like {
    display: none;
  }

  .liked-content-header {
    flex-direction: column;
    align-items: stretch;
  }

  .liked-search {
    width: 100%;
  }
}
</style>
