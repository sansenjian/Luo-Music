<script setup lang="ts">
import { formatDuration, type FormattedSong } from '@/utils/songFormatter'

const props = defineProps<{
  song: FormattedSong
  filteredIndex: number
  active: boolean
}>()

const emit = defineEmits<{
  play: [index: number]
  focus: [index: number]
}>()
</script>

<template>
  <button
    class="song-item"
    type="button"
    :data-filtered-index="filteredIndex"
    :tabindex="active ? 0 : -1"
    @click="emit('play', filteredIndex)"
    @focus="emit('focus', filteredIndex)"
  >
    <span class="song-index">{{ song.index + 1 }}</span>
    <div class="song-cover">
      <img :src="song.cover" :alt="song.name" loading="lazy" />
      <div class="song-play-overlay">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"></path>
        </svg>
      </div>
    </div>
    <div class="song-info">
      <h4 class="song-name">{{ song.name }}</h4>
      <p class="song-artist">{{ song.artist }}</p>
    </div>
    <span class="song-album">{{ song.album }}</span>
    <span class="song-duration">{{ formatDuration(props.song.duration * 1000) }}</span>
  </button>
</template>

<style scoped>
.song-item {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 52px minmax(0, 1fr) 200px 60px;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  height: var(--item-height);
  border: none;
  border-bottom: 1px solid var(--bg-dark);
  background: var(--white);
  text-align: left;
  transition: all 0.2s ease;
  cursor: pointer;
}

.song-item:last-child {
  border-bottom: none;
}

.song-item:hover {
  background: linear-gradient(90deg, var(--bg) 0%, var(--white) 100%);
  padding-left: 24px;
}

.song-item:hover .song-index {
  color: var(--accent);
  font-weight: 700;
}

.song-item:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}

.song-index {
  font-size: 14px;
  color: var(--gray);
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: all 0.2s ease;
}

.song-cover {
  width: 52px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid var(--black);
  transition: transform 0.2s ease;
  position: relative;
}

.song-item:hover .song-cover {
  transform: scale(1.05);
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--bg);
}

.song-play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--white);
}

.song-item:hover .song-play-overlay {
  opacity: 1;
}

.song-info {
  min-width: 0;
}

.song-name {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-album {
  width: 200px;
  font-size: 12px;
  color: var(--gray);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.song-duration {
  width: 60px;
  text-align: right;
  font-size: 12px;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .song-item {
    grid-template-columns: 32px 44px minmax(0, 1fr) 60px;
    padding: 12px 16px;
    gap: 12px;
  }

  .song-cover {
    width: 44px;
    height: 44px;
  }

  .song-album {
    display: none;
  }
}
</style>
