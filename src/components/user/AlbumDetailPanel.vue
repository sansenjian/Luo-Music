<script setup lang="ts">
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import type { Song } from '@/platform/music/interface'

interface AlbumDetailPanelProps {
  album: FavoriteAlbumItem | null
  songs: Song[]
  loading?: boolean
  // eslint-disable-next-line vue/require-default-prop
  error?: unknown
}

const props = withDefaults(defineProps<AlbumDetailPanelProps>(), {
  loading: false
})

const emit = defineEmits<{
  close: []
  retry: []
  'play-all': []
  'play-song': [index: number]
}>()

function formatArtists(song: Song): string {
  return song.artists
    .map(artist => artist.name)
    .filter(Boolean)
    .join(' / ')
}

function formatDuration(duration: number): string {
  const totalSeconds = Math.max(0, Math.floor(duration / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function resolveSongCover(song: Song): string {
  return song.album.picUrl || props.album?.picUrl || ''
}
</script>

<template>
  <section class="album-detail-panel">
    <div class="detail-header">
      <div class="detail-hero">
        <img
          v-if="props.album?.picUrl"
          class="detail-cover"
          :src="props.album.picUrl"
          :alt="props.album.name"
          loading="lazy"
        />

        <div class="detail-copy">
          <p class="detail-eyebrow">收藏专辑</p>
          <h3 class="detail-title">{{ props.album?.name ?? '已选择专辑' }}</h3>
          <p class="detail-meta">
            {{ props.album?.artistName || '未知艺术家' }}
            <span>· {{ props.songs.length }} 首歌曲</span>
          </p>
        </div>
      </div>

      <div class="detail-actions">
        <button type="button" class="detail-action primary" @click="emit('play-all')">
          播放全部
        </button>
        <button type="button" class="detail-action" @click="emit('close')">收起</button>
      </div>
    </div>

    <div v-if="props.error" class="detail-state detail-state-error" role="alert">
      <div>
        <strong>专辑详情加载失败</strong>
        <p>请重新请求该专辑内容。</p>
      </div>
      <button type="button" class="detail-action" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="props.loading" class="detail-state">
      <p>专辑详情加载中...</p>
    </div>

    <div v-else-if="props.songs.length === 0" class="detail-state">
      <p>当前专辑暂无可播放歌曲。</p>
    </div>

    <div v-else class="detail-list">
      <button
        v-for="(song, index) in props.songs"
        :key="`${song.id}-${index}`"
        type="button"
        class="detail-song"
        @click="emit('play-song', index)"
      >
        <span class="detail-song-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <img
          v-if="resolveSongCover(song)"
          class="detail-song-cover"
          :src="resolveSongCover(song)"
          :alt="song.name"
          loading="lazy"
        />
        <div v-else class="detail-song-cover detail-song-cover-fallback" aria-hidden="true"></div>
        <div class="detail-song-copy">
          <span class="detail-song-name">{{ song.name }}</span>
          <span class="detail-song-artist">{{ formatArtists(song) || '未知歌手' }}</span>
        </div>
        <span class="detail-song-duration">{{ formatDuration(song.duration) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.album-detail-panel {
  margin-bottom: 24px;
  padding: 20px;
  border: 2px solid var(--black);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 112, 59, 0.1), transparent 55%), var(--white);
  box-shadow: 6px 6px 0 var(--black);
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.detail-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.detail-cover {
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  object-fit: cover;
  border: 2px solid var(--black);
  border-radius: 14px;
  background: var(--bg);
}

.detail-copy {
  min-width: 0;
}

.detail-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.detail-title {
  margin: 0;
  font-size: 24px;
  color: var(--black);
}

.detail-meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gray);
}

.detail-actions {
  display: flex;
  gap: 10px;
}

.detail-action {
  padding: 10px 16px;
  border: 2px solid var(--black);
  border-radius: 10px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.detail-action:hover {
  background: var(--black);
  color: var(--white);
}

.detail-action.primary {
  background: var(--accent);
  color: var(--white);
}

.detail-action.primary:hover {
  background: #e55a2b;
}

.detail-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 20px;
  border: 2px dashed var(--gray-light);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.detail-state p,
.detail-state strong {
  margin: 0;
}

.detail-state-error {
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-song {
  display: grid;
  grid-template-columns: 36px 52px minmax(0, 1fr) 56px;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 14px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.detail-song:hover {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--black);
}

.detail-song-index,
.detail-song-duration {
  font-size: 12px;
  font-weight: 700;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
}

.detail-song-cover {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 8px;
  border: 2px solid var(--black);
  background: var(--bg);
}

.detail-song-cover-fallback {
  background: linear-gradient(135deg, rgba(255, 112, 59, 0.2), rgba(0, 0, 0, 0.06)), var(--bg);
}

.detail-song-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-song-name,
.detail-song-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-song-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--black);
}

.detail-song-artist {
  font-size: 12px;
  color: var(--gray);
}

@media (max-width: 768px) {
  .detail-header,
  .detail-state-error,
  .detail-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-cover {
    width: 100%;
    max-width: 160px;
    height: auto;
    aspect-ratio: 1;
  }

  .detail-actions {
    width: 100%;
  }

  .detail-action {
    flex: 1;
  }

  .detail-song {
    grid-template-columns: 28px 44px minmax(0, 1fr);
  }

  .detail-song-duration {
    grid-column: 3;
    justify-self: end;
  }
}
</style>
