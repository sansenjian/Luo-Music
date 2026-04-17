<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import { useUserPlaylists } from '@/composables/useUserPlaylists'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'
import type { Song } from '@/platform/music/interface'
import { formatDuration } from '@/utils/songFormatter'

import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

const props = defineProps<{
  collection: HomeSidebarCollectionSelection | null
}>()

type FormattedDetailSong = {
  id: string | number
  name: string
  artist: string
  album: string
  cover: string
  duration: number
}

const userStore = useUserStore()
const playerStore = usePlayerStore()
const toastStore = useToastStore()
const { loadPlaylistSongs } = useUserPlaylists()
const { loadAlbumSongs } = useFavoriteAlbums()

const songs = ref<Song[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const requestVersion = ref(0)
const searchQuery = ref('')

const normalizedQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase())
const title = computed(() => props.collection?.name ?? '已选择歌单')
const kicker = computed(() => (props.collection?.kind === 'album' ? '收藏专辑' : '歌单'))
const metaLabel = computed(() => {
  if (!props.collection) {
    return ''
  }

  if (props.collection.kind === 'album') {
    return props.collection.summary
  }

  return userStore.nickname
    ? `${userStore.nickname} · ${props.collection.summary}`
    : props.collection.summary
})
const coverUrl = computed(() => props.collection?.coverUrl || '')
const currentSongId = computed(() => playerStore.currentSong?.id ?? null)
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

  return '详情加载失败，请稍后重试。'
})
const formattedSongs = computed<FormattedDetailSong[]>(() =>
  songs.value.map(song => ({
    id: song.id,
    name: song.name,
    artist:
      song.artists
        .map(artist => artist.name)
        .filter(Boolean)
        .join(' / ') || '未知歌手',
    album: song.album?.name || '单曲',
    cover: song.album?.picUrl || coverUrl.value,
    duration: song.duration
  }))
)
const filteredSongs = computed(() => {
  if (!normalizedQuery.value) {
    return formattedSongs.value
  }

  return formattedSongs.value.filter(song => {
    const fields = [song.name, song.artist, song.album]
    return fields.some(field => field.toLocaleLowerCase().includes(normalizedQuery.value))
  })
})

async function loadCollectionSongs(): Promise<void> {
  const collection = props.collection
  if (!collection) {
    songs.value = []
    error.value = null
    loading.value = false
    return
  }

  const currentRequest = requestVersion.value + 1
  requestVersion.value = currentRequest
  loading.value = true
  error.value = null

  try {
    const nextSongs =
      collection.kind === 'album'
        ? await loadAlbumSongs(collection.sourceId)
        : await loadPlaylistSongs(collection.sourceId)

    if (requestVersion.value !== currentRequest) {
      return
    }

    songs.value = nextSongs
  } catch (requestError) {
    if (requestVersion.value !== currentRequest) {
      return
    }

    songs.value = []
    error.value = requestError
  } finally {
    if (requestVersion.value === currentRequest) {
      loading.value = false
    }
  }
}

watch(
  () => props.collection?.uiId ?? null,
  () => {
    searchQuery.value = ''
    void loadCollectionSongs()
  },
  { immediate: true }
)

async function playCollectionAt(index: number): Promise<void> {
  if (loading.value || filteredSongs.value.length === 0) {
    return
  }

  const targetSong = filteredSongs.value[index]
  if (!targetSong) {
    return
  }

  const playbackList = filteredSongs.value
    .map(song => songs.value.find(candidate => candidate.id === song.id))
    .filter((song): song is Song => Boolean(song))
  const playbackIndex = playbackList.findIndex(song => song.id === targetSong.id)

  if (playbackIndex === -1) {
    return
  }

  try {
    playerStore.setSongList(playbackList)
    await playerStore.playSongWithDetails(playbackIndex)
  } catch (playbackError) {
    const message =
      playbackError instanceof Error ? playbackError.message : '播放歌单详情时发生错误。'
    toastStore.error(message)
  }
}

function playAll(): void {
  void playCollectionAt(0)
}

function clearSearch(): void {
  searchQuery.value = ''
}
</script>

<template>
  <section class="collection-panel">
    <div v-if="!props.collection" class="collection-empty-state">
      <p>请选择一个歌单或收藏专辑。</p>
    </div>

    <div v-else class="collection-shell">
      <section class="collection-hero">
        <div class="collection-cover">
          <img v-if="coverUrl" :src="coverUrl" :alt="title" class="collection-cover-image" />
          <div v-else class="collection-cover-image collection-cover-fallback"></div>
        </div>

        <div class="collection-summary">
          <p class="collection-kicker">{{ kicker }}</p>
          <h1>{{ title }}</h1>
          <div class="collection-meta">
            <img
              v-if="userStore.avatarUrl"
              :src="userStore.avatarUrl"
              :alt="userStore.nickname || '用户头像'"
              class="collection-meta-avatar"
            />
            <span v-else class="collection-meta-avatar fallback">
              {{ userStore.nickname?.charAt(0) || '我' }}
            </span>
            <span class="collection-meta-copy">{{ metaLabel }}</span>
            <span class="collection-meta-count">{{ songs.length }} 首歌曲</span>
          </div>

          <div class="collection-actions">
            <button type="button" class="hero-action hero-action-primary" @click="playAll">
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

      <section class="collection-content">
        <div class="collection-content-header">
          <div class="collection-content-main">
            <div class="collection-subtabs" aria-label="详情分区">
              <button type="button" class="subtab active">歌曲 {{ songs.length }}</button>
              <button type="button" class="subtab" disabled>评论</button>
              <button type="button" class="subtab" disabled>收藏者</button>
            </div>

            <div v-if="error" class="collection-inline-error" role="alert">
              <span>{{ errorMessage }}</span>
              <button type="button" class="inline-action" @click="loadCollectionSongs">重试</button>
            </div>
          </div>

          <label class="collection-search">
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

        <div v-if="loading" class="collection-empty-state">
          <p>正在加载 {{ kicker }} 内容...</p>
        </div>

        <div v-else class="collection-table">
          <div class="collection-table-head">
            <span class="col-index">#</span>
            <span class="col-title">标题</span>
            <span class="col-album">专辑</span>
            <span class="col-like">喜欢</span>
            <span class="col-duration">时长</span>
          </div>

          <div v-if="filteredSongs.length === 0" class="collection-empty-state">
            <p>没有找到匹配的歌曲。</p>
          </div>

          <button
            v-for="(song, index) in filteredSongs"
            :key="`${song.id}-${index}`"
            type="button"
            class="collection-row"
            :class="{ active: currentSongId === song.id }"
            @click="playCollectionAt(index)"
          >
            <span class="col-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="col-title song-primary">
              <img :src="song.cover" :alt="song.name" class="song-cover" />
              <span class="song-copy">
                <strong>{{ song.name }}</strong>
                <span>{{ song.artist }}</span>
              </span>
            </span>
            <span class="col-album">{{ song.album }}</span>
            <span class="col-like">
              <span class="like-indicator" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z"
                  />
                </svg>
              </span>
            </span>
            <span class="col-duration">{{ formatDuration(song.duration) }}</span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.collection-panel {
  height: 100%;
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.96)), var(--bg);
}

.collection-shell {
  min-height: 100%;
  padding: 34px 34px 40px;
}

.collection-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 28px;
  align-items: end;
}

.collection-cover {
  width: 180px;
  height: 180px;
  border: 3px solid var(--black);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.12);
  background: linear-gradient(135deg, #d3dae7, #eef2f8);
}

.collection-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.collection-cover-fallback {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #ced8e6, #eef2f8 70%, #ffffff);
}

.collection-summary h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.collection-kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gray);
}

.collection-meta {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--gray);
  font-size: 13px;
}

.collection-meta-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid var(--black);
}

.collection-meta-avatar.fallback {
  display: grid;
  place-items: center;
  background: var(--black);
  color: var(--white);
  font-weight: 700;
}

.collection-meta-copy {
  color: var(--black);
  font-weight: 700;
}

.collection-actions {
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

.hero-action-icon {
  min-width: 42px;
  padding-inline: 14px;
}

.collection-content {
  margin-top: 36px;
}

.collection-content-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 8px;
}

.collection-content-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collection-subtabs {
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

.collection-inline-error {
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

.collection-search {
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

.collection-search input {
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

.collection-table {
  margin-top: 2px;
}

.collection-table-head,
.collection-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 2.3fr) minmax(120px, 1.4fr) 58px 72px;
  gap: 16px;
  align-items: center;
}

.collection-table-head {
  padding: 8px 18px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 700;
}

.collection-row {
  width: 100%;
  padding: 12px 18px;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.collection-row:hover {
  background: rgba(255, 255, 255, 0.68);
}

.collection-row.active {
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

.collection-empty-state {
  min-height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 64px 24px;
  color: var(--gray);
}

@media (max-width: 960px) {
  .collection-shell {
    padding: 24px 20px 32px;
  }

  .collection-hero {
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 20px;
  }

  .collection-cover {
    width: 140px;
    height: 140px;
  }
}

@media (max-width: 760px) {
  .collection-hero {
    grid-template-columns: 1fr;
  }

  .collection-cover {
    width: 180px;
    height: 180px;
  }

  .collection-table-head,
  .collection-row {
    grid-template-columns: 38px minmax(0, 1fr) 56px;
  }

  .col-album,
  .collection-table-head .col-album,
  .collection-table-head .col-like,
  .collection-row .col-like {
    display: none;
  }

  .collection-content-header {
    flex-direction: column;
    align-items: stretch;
  }

  .collection-search {
    width: 100%;
  }
}
</style>
