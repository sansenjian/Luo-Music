<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import SongDetailList from '@/components/user/SongDetailList.vue'
import { useLocalLibrary } from '@/composables/useLocalLibrary'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryTrack,
  LocalLibraryTrackQuery,
  LocalLibraryViewMode
} from '@/types/localLibrary'

const playerStore = usePlayerStore()
const toastStore = useToastStore()
const {
  state,
  status,
  loading,
  pageLoading,
  mutating,
  songsPage,
  artistsPage,
  albumsPage,
  coverUrls,
  addFolder,
  removeFolder,
  setFolderEnabled,
  rescan,
  loadTracks,
  loadArtists,
  loadAlbums
} = useLocalLibrary()

const activeView = ref<LocalLibraryViewMode>('songs')
const searchDraft = ref('')
const appliedSearch = ref('')
const selectedArtist = ref<string | null>(null)
const selectedAlbum = ref<Pick<LocalLibraryAlbumSummary, 'name' | 'artist'> | null>(null)
const viewModes: LocalLibraryViewMode[] = ['songs', 'artists', 'albums']

const isScanning = computed(() => status.value.phase === 'scanning')
const hasEnabledFolders = computed(() => state.value.folders.some(folder => folder.enabled))
const totalFolderLabel = computed(() => `${state.value.folders.length} 个文件夹`)
const totalTrackLabel = computed(() => `${status.value.discoveredTracks} 首歌曲`)
const lastScanLabel = computed(() => {
  const finishedAt = status.value.finishedAt
  if (!finishedAt) {
    return '尚未完成扫描'
  }

  return formatDateTime(finishedAt)
})

const currentSongQuery = computed<LocalLibraryTrackQuery>(() => ({
  search: appliedSearch.value || undefined,
  artist: selectedAlbum.value ? selectedAlbum.value.artist : selectedArtist.value,
  album: selectedAlbum.value?.name
}))

const displayTracks = computed<LocalLibraryTrack[]>(() =>
  songsPage.value.items.map(track => {
    const coverUrl = track.coverHash ? (coverUrls.value[track.coverHash] ?? '') : ''
    return {
      ...track,
      song: {
        ...track.song,
        album: {
          ...track.song.album,
          picUrl: coverUrl || track.song.album.picUrl
        }
      }
    }
  })
)

const playbackSongs = computed(() => displayTracks.value.map(track => track.song))
const artistItems = computed(() => artistsPage.value.items)
const albumItems = computed(() => albumsPage.value.items)
const currentSummaryLabel = computed(() => {
  if (activeView.value === 'artists') {
    return `${artistsPage.value.total} 位艺人`
  }

  if (activeView.value === 'albums') {
    return `${albumsPage.value.total} 张专辑`
  }

  return `${songsPage.value.total} 首歌曲`
})

const activeSongScopeLabel = computed(() => {
  if (selectedAlbum.value) {
    return `${selectedAlbum.value.artist} / ${selectedAlbum.value.name}`
  }

  if (selectedArtist.value) {
    return selectedArtist.value
  }

  return null
})

watch(activeView, nextView => {
  if (nextView === 'songs') {
    void loadTracks(currentSongQuery.value)
    return
  }

  if (nextView === 'artists') {
    void loadArtists({
      search: appliedSearch.value || undefined
    })
    return
  }

  void loadAlbums({
    search: appliedSearch.value || undefined
  })
})

async function handleAddFolder(): Promise<void> {
  try {
    const nextState = await addFolder()
    if (!nextState) {
      return
    }

    toastStore.success(
      nextState.folders.length > 0 ? '本地音乐文件夹已加入资料库' : '已更新本地音乐资料库'
    )
  } catch (error) {
    toastStore.error(resolveErrorMessage(error, '添加本地音乐文件夹失败'))
  }
}

async function handleRemoveFolder(folderId: string): Promise<void> {
  try {
    await removeFolder(folderId)
    toastStore.success('已移除本地音乐文件夹')
  } catch (error) {
    toastStore.error(resolveErrorMessage(error, '移除本地音乐文件夹失败'))
  }
}

async function handleToggleFolder(folder: LocalLibraryFolder): Promise<void> {
  try {
    await setFolderEnabled(folder.id, !folder.enabled)
    toastStore.success(folder.enabled ? '已停用本地音乐文件夹' : '已启用本地音乐文件夹')
  } catch (error) {
    toastStore.error(resolveErrorMessage(error, '更新本地音乐文件夹状态失败'))
  }
}

async function handleRescan(): Promise<void> {
  try {
    await rescan()
    toastStore.success('本地音乐扫描完成')
  } catch (error) {
    toastStore.error(resolveErrorMessage(error, '重新扫描本地音乐失败'))
  }
}

async function handleSearchSubmit(): Promise<void> {
  appliedSearch.value = searchDraft.value.trim()

  if (activeView.value === 'songs') {
    await loadTracks(currentSongQuery.value)
    return
  }

  if (activeView.value === 'artists') {
    await loadArtists({
      search: appliedSearch.value || undefined
    })
    return
  }

  await loadAlbums({
    search: appliedSearch.value || undefined
  })
}

async function handleLoadMore(): Promise<void> {
  if (activeView.value === 'songs') {
    await loadTracks(currentSongQuery.value, true)
    return
  }

  if (activeView.value === 'artists') {
    await loadArtists(
      {
        search: appliedSearch.value || undefined
      },
      true
    )
    return
  }

  await loadAlbums(
    {
      search: appliedSearch.value || undefined
    },
    true
  )
}

async function focusArtist(artist: LocalLibraryArtistSummary): Promise<void> {
  selectedArtist.value = artist.name
  selectedAlbum.value = null
  activeView.value = 'songs'
}

async function focusAlbum(album: LocalLibraryAlbumSummary): Promise<void> {
  selectedAlbum.value = {
    name: album.name,
    artist: album.artist
  }
  selectedArtist.value = null
  activeView.value = 'songs'
}

async function clearSongScope(): Promise<void> {
  selectedArtist.value = null
  selectedAlbum.value = null
  await loadTracks(currentSongQuery.value)
}

async function playLocalSongAt(index: number): Promise<void> {
  const nextSongList = playbackSongs.value
  if (nextSongList.length === 0) {
    return
  }

  try {
    playerStore.setSongList(nextSongList)
    await playerStore.playSongWithDetails(index)
  } catch (error) {
    toastStore.error(resolveErrorMessage(error, '播放本地音乐失败'))
  }
}

function clearSearch(): void {
  searchDraft.value = ''
  appliedSearch.value = ''
  if (activeView.value === 'songs') {
    void loadTracks(currentSongQuery.value)
    return
  }

  if (activeView.value === 'artists') {
    void loadArtists()
    return
  }

  void loadAlbums()
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}

function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatTotalDuration(duration: number): string {
  const totalMinutes = Math.max(1, Math.round(duration / 60000))
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

function resolveCoverUrl(coverHash: string | null): string {
  return coverHash ? (coverUrls.value[coverHash] ?? '') : ''
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
</script>

<template>
  <section class="local-panel">
    <div v-if="!state.supported" class="local-empty-state">
      <div class="empty-icon">♪</div>
      <h2>本地音乐仅支持桌面端</h2>
      <p>当前运行环境无法直接访问本地文件系统，请在 Electron 版本中使用这个功能。</p>
    </div>

    <div v-else class="local-shell">
      <section class="local-hero">
        <div class="local-summary">
          <p class="local-kicker">资料库</p>
          <h1>本地音乐</h1>
          <div class="local-meta">
            <span>{{ totalFolderLabel }}</span>
            <span>{{ totalTrackLabel }}</span>
            <span>最近扫描 {{ lastScanLabel }}</span>
          </div>
          <p class="local-status" :class="[`is-${status.phase}`]">
            {{ status.message }}
          </p>
          <div v-if="isScanning" class="local-progress">
            <span>已扫描 {{ status.scannedFolders }} 个文件夹</span>
            <span>已检查 {{ status.scannedFiles }} 个文件</span>
            <span>已收录 {{ status.discoveredTracks }} 首</span>
          </div>
        </div>

        <div class="local-actions">
          <button
            type="button"
            class="hero-action hero-action-primary"
            :disabled="mutating"
            @click="handleAddFolder"
          >
            添加文件夹
          </button>
          <button
            type="button"
            class="hero-action"
            :disabled="mutating || !hasEnabledFolders"
            @click="handleRescan"
          >
            {{ isScanning ? '扫描中...' : '重新扫描' }}
          </button>
        </div>
      </section>

      <section v-if="state.folders.length > 0" class="local-folders">
        <div class="local-section-header">
          <h2>已加入的文件夹</h2>
          <span>{{ totalFolderLabel }}</span>
        </div>
        <div class="folder-chip-list">
          <article v-for="folder in state.folders" :key="folder.id" class="folder-chip">
            <div class="folder-chip-copy">
              <strong>{{ folder.name }}</strong>
              <span>{{ folder.songCount }} 首 · {{ folder.path }}</span>
            </div>
            <div class="folder-chip-actions">
              <button
                type="button"
                class="folder-chip-action"
                :disabled="mutating"
                @click="handleToggleFolder(folder)"
              >
                {{ folder.enabled ? '停用' : '启用' }}
              </button>
              <button
                type="button"
                class="folder-chip-action danger"
                :disabled="mutating"
                @click="handleRemoveFolder(folder.id)"
              >
                移除
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="state.folders.length > 0" class="local-content">
        <div class="local-content-header">
          <div class="local-section-header">
            <h2>
              {{
                activeView === 'songs'
                  ? '歌曲列表'
                  : activeView === 'artists'
                    ? '艺人视图'
                    : '专辑视图'
              }}
            </h2>
            <span>{{ currentSummaryLabel }}</span>
          </div>

          <div class="local-toolbar">
            <div class="local-view-tabs">
              <button
                v-for="view in viewModes"
                :key="view"
                type="button"
                class="view-tab"
                :class="{ active: activeView === view }"
                @click="activeView = view"
              >
                {{ view === 'songs' ? '歌曲' : view === 'artists' ? '艺人' : '专辑' }}
              </button>
            </div>

            <form class="local-search" @submit.prevent="handleSearchSubmit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-3.5-3.5"></path>
              </svg>
              <input
                v-model="searchDraft"
                type="search"
                :placeholder="activeView === 'songs' ? '搜索歌曲、歌手、专辑或文件名' : '搜索名称'"
              />
              <button type="submit" class="search-submit">搜索</button>
              <button
                v-if="searchDraft || appliedSearch"
                type="button"
                class="search-clear"
                aria-label="清空搜索"
                @click="clearSearch"
              >
                ×
              </button>
            </form>
          </div>
        </div>

        <div v-if="activeSongScopeLabel" class="active-scope">
          <span>当前筛选：{{ activeSongScopeLabel }}</span>
          <button type="button" class="scope-clear" @click="clearSongScope">查看全部歌曲</button>
        </div>

        <div
          v-if="
            (loading || pageLoading) &&
            ((activeView === 'songs' && songsPage.items.length === 0) ||
              (activeView === 'artists' && artistsPage.items.length === 0) ||
              (activeView === 'albums' && albumsPage.items.length === 0))
          "
          class="local-empty-state"
        >
          <div class="empty-icon">…</div>
          <h2>正在读取本地音乐</h2>
          <p>稍等片刻，桌面端正在准备你的本地资料库。</p>
        </div>

        <div
          v-else-if="
            activeView === 'songs' &&
            songsPage.items.length === 0 &&
            (appliedSearch || activeSongScopeLabel)
          "
          class="local-empty-state"
        >
          <div class="empty-icon">?</div>
          <h2>没有匹配结果</h2>
          <p>试试更短的关键词，或者切换筛选范围后再搜索。</p>
        </div>

        <div
          v-else-if="activeView === 'songs' && songsPage.items.length === 0"
          class="local-empty-state"
        >
          <div class="empty-icon">♪</div>
          <h2>还没有扫描到歌曲</h2>
          <p>请确认文件夹里包含常见音频格式，例如 MP3、FLAC、M4A 或 OGG。</p>
        </div>

        <div
          v-else-if="activeView === 'artists' && artistsPage.items.length === 0"
          class="local-empty-state"
        >
          <div class="empty-icon">◎</div>
          <h2>还没有可展示的艺人</h2>
          <p>添加文件夹并完成扫描后，这里会按艺人聚合你的本地资料库。</p>
        </div>

        <div
          v-else-if="activeView === 'albums' && albumsPage.items.length === 0"
          class="local-empty-state"
        >
          <div class="empty-icon">▣</div>
          <h2>还没有可展示的专辑</h2>
          <p>添加文件夹并完成扫描后，这里会按专辑聚合你的本地资料库。</p>
        </div>

        <SongDetailList
          v-else-if="activeView === 'songs'"
          :songs="playbackSongs"
          fallback-cover=""
          @play-song="playLocalSongAt"
        />

        <div v-else-if="activeView === 'artists'" class="summary-grid">
          <article v-for="artist in artistItems" :key="artist.id" class="summary-card">
            <div
              class="summary-cover"
              :class="{ empty: !resolveCoverUrl(artist.coverHash) }"
              :style="
                resolveCoverUrl(artist.coverHash)
                  ? { backgroundImage: `url(${resolveCoverUrl(artist.coverHash)})` }
                  : undefined
              "
            >
              <span v-if="!resolveCoverUrl(artist.coverHash)">艺</span>
            </div>
            <div class="summary-copy">
              <strong>{{ artist.name }}</strong>
              <span>
                {{ artist.trackCount }} 首 · {{ formatTotalDuration(artist.totalDuration) }}
              </span>
            </div>
            <button type="button" class="summary-action" @click="focusArtist(artist)">
              查看歌曲
            </button>
          </article>
        </div>

        <div v-else class="summary-grid">
          <article v-for="album in albumItems" :key="album.id" class="summary-card">
            <div
              class="summary-cover"
              :class="{ empty: !resolveCoverUrl(album.coverHash) }"
              :style="
                resolveCoverUrl(album.coverHash)
                  ? { backgroundImage: `url(${resolveCoverUrl(album.coverHash)})` }
                  : undefined
              "
            >
              <span v-if="!resolveCoverUrl(album.coverHash)">专</span>
            </div>
            <div class="summary-copy">
              <strong>{{ album.name }}</strong>
              <span>{{ album.artist }}</span>
              <span>
                {{ album.trackCount }} 首 · {{ formatTotalDuration(album.totalDuration) }}
              </span>
            </div>
            <button type="button" class="summary-action" @click="focusAlbum(album)">
              查看歌曲
            </button>
          </article>
        </div>

        <div
          v-if="
            (activeView === 'songs' && songsPage.nextCursor) ||
            (activeView === 'artists' && artistsPage.nextCursor) ||
            (activeView === 'albums' && albumsPage.nextCursor)
          "
          class="load-more-row"
        >
          <button type="button" class="hero-action" :disabled="pageLoading" @click="handleLoadMore">
            {{ pageLoading ? '加载中...' : '加载更多' }}
          </button>
        </div>

        <div v-if="activeView === 'songs' && songsPage.items.length > 0" class="local-footnote">
          <span>当前列表使用分页查询加载，本地封面会按需懒加载并缓存。</span>
          <span>
            当前页文件大小约
            {{ formatBytes(displayTracks.reduce((sum, track) => sum + track.fileSize, 0)) }}
          </span>
        </div>
      </section>

      <div v-else class="local-empty-state">
        <div class="empty-icon">＋</div>
        <h2>添加你的第一个本地音乐文件夹</h2>
        <p>扫描完成后，这里会直接展示可播放的本地歌曲列表。</p>
        <button
          type="button"
          class="hero-action hero-action-primary"
          :disabled="mutating"
          @click="handleAddFolder"
        >
          选择文件夹
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.local-panel {
  height: 100%;
  min-height: 0;
}

.local-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.4rem 1.6rem 1.6rem;
  overflow: auto;
}

.local-hero,
.local-folders,
.local-content,
.local-empty-state {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.94) 100%),
    rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.local-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
}

.local-summary {
  display: grid;
  gap: 0.65rem;
}

.local-kicker {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.local-summary h1,
.local-empty-state h2,
.local-section-header h2 {
  margin: 0;
  color: #0f172a;
}

.local-meta,
.local-progress,
.local-footnote {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  color: #475569;
  font-size: 0.92rem;
}

.local-status {
  margin: 0;
  color: #334155;
}

.local-status.is-error {
  color: #be123c;
}

.local-status.is-scanning {
  color: #b45309;
}

.local-actions,
.folder-chip-actions,
.load-more-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.hero-action,
.folder-chip-action,
.summary-action,
.view-tab,
.scope-clear,
.search-submit {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  padding: 0.8rem 1.1rem;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.hero-action:hover:not(:disabled),
.folder-chip-action:hover:not(:disabled),
.summary-action:hover:not(:disabled),
.view-tab:hover:not(:disabled),
.scope-clear:hover:not(:disabled),
.search-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}

.hero-action:disabled,
.folder-chip-action:disabled,
.summary-action:disabled,
.view-tab:disabled,
.scope-clear:disabled,
.search-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hero-action-primary,
.summary-action,
.search-submit,
.view-tab.active {
  border-color: transparent;
  background: linear-gradient(135deg, #ea580c, #f97316);
  color: white;
}

.local-folders,
.local-content {
  display: grid;
  gap: 1rem;
  padding: 1.35rem 1.4rem 1.4rem;
}

.local-section-header,
.local-content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.local-content-header {
  flex-direction: column;
  align-items: stretch;
}

.local-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.local-view-tabs {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.local-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: min(100%, 28rem);
  padding: 0.35rem 0.45rem 0.35rem 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
}

.local-search input {
  flex: 1;
  min-width: 10rem;
  border: none;
  background: transparent;
  color: #0f172a;
  outline: none;
}

.search-submit {
  padding: 0.55rem 0.95rem;
}

.search-clear {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 1.1rem;
}

.active-scope {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  border-radius: 18px;
  background: rgba(241, 245, 249, 0.9);
  color: #334155;
}

.scope-clear {
  padding: 0.55rem 0.9rem;
}

.folder-chip-list,
.summary-grid {
  display: grid;
  gap: 0.9rem;
}

.folder-chip {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  border-radius: 20px;
  background: rgba(248, 250, 252, 0.92);
}

.folder-chip-copy {
  display: grid;
  gap: 0.25rem;
}

.folder-chip-copy span {
  color: #64748b;
  font-size: 0.9rem;
}

.folder-chip-action {
  padding: 0.6rem 0.9rem;
}

.folder-chip-action.danger {
  color: #be123c;
}

.summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.summary-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.9);
}

.summary-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(251, 191, 36, 0.18)),
    rgba(255, 255, 255, 0.9);
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #c2410c;
  font-weight: 700;
  font-size: 1.1rem;
}

.summary-cover.empty {
  border: 1px dashed rgba(249, 115, 22, 0.25);
}

.summary-copy {
  display: grid;
  gap: 0.25rem;
}

.summary-copy strong {
  color: #0f172a;
}

.summary-copy span {
  color: #64748b;
  font-size: 0.9rem;
}

.summary-action {
  justify-self: flex-start;
  padding: 0.65rem 0.95rem;
}

.load-more-row {
  justify-content: center;
}

.local-empty-state {
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  text-align: center;
  padding: 2.2rem 1.5rem;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 999px;
  background: rgba(249, 115, 22, 0.12);
  color: #c2410c;
  font-size: 1.4rem;
}

@media (max-width: 900px) {
  .local-hero,
  .folder-chip,
  .active-scope {
    flex-direction: column;
    align-items: stretch;
  }

  .local-search {
    width: 100%;
  }
}
</style>
