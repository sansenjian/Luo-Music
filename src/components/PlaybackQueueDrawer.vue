<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

import { usePlayerStore } from '@/store/playerStore'
import type { Song } from '@/types/schemas'
import { formatTime } from '@/utils/player/helpers/timeFormatter'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

type QueueSongView = {
  artistText: string
  cover: string
  duration: number
  id: Song['id']
  isCurrent: boolean
  platformText: string
  song: Song
}

const playerStore = usePlayerStore()
const listRef = ref<HTMLElement | null>(null)

const queueSongs = computed<QueueSongView[]>(() =>
  playerStore.songList.map((song, index) => ({
    artistText: Array.isArray(song.artists)
      ? song.artists.map(artist => artist.name).join(' / ')
      : '',
    cover: song.album?.picUrl ?? '',
    duration: Math.floor((song.duration || 0) / 1000),
    id: song.id,
    isCurrent: index === playerStore.currentIndex,
    platformText: song.platform === 'qq' ? 'QQ' : song.platform === 'local' ? 'LOCAL' : 'NETEASE',
    song
  }))
)

const currentSongTitle = computed(() => playerStore.currentSongInfo?.name ?? '未开始播放')
const queueCountText = computed(() => `共${playerStore.songList.length}首歌曲`)
const canClearQueue = computed(() => playerStore.songList.length > 0)

watch(
  () => [props.open, playerStore.currentIndex, playerStore.songList.length] as const,
  ([open]) => {
    if (!open || playerStore.currentIndex < 0) {
      return
    }

    void nextTick(() => {
      const listElement = listRef.value
      const currentElement = listElement?.querySelector<HTMLElement>('[data-current="true"]')
      currentElement?.scrollIntoView({ block: 'nearest' })
    })
  },
  { immediate: true }
)

function closeDrawer(): void {
  emit('close')
}

async function playSong(index: number): Promise<void> {
  await playerStore.playSongWithDetails(index)
}

function removeSong(index: number): void {
  playerStore.removeSongFromPlaylist(index)
}

function clearQueue(): void {
  playerStore.clearPlaylist()
}

function handleLayerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeDrawer()
  }
}

watch(
  () => props.open,
  open => {
    if (open) {
      document.addEventListener('keydown', handleLayerKeydown)
    } else {
      document.removeEventListener('keydown', handleLayerKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleLayerKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="queue-fade">
      <div v-if="props.open" class="queue-layer" @click.self="closeDrawer">
        <Transition name="queue-slide" appear>
          <aside
            class="queue-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="playback-queue-title"
            @click.stop
          >
            <header class="queue-header">
              <div class="queue-heading">
                <h2 id="playback-queue-title">播放队列</h2>
                <p>{{ queueCountText }}</p>
              </div>
              <div class="queue-actions">
                <button
                  class="queue-icon-button"
                  type="button"
                  aria-label="清空播放队列"
                  title="清空播放队列"
                  :disabled="!canClearQueue"
                  @click="clearQueue"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4h8v2"></path>
                    <path d="M19 6l-1 14H6L5 6"></path>
                    <path d="M10 11v5"></path>
                    <path d="M14 11v5"></path>
                  </svg>
                </button>
                <button
                  class="queue-icon-button"
                  type="button"
                  aria-label="关闭播放队列"
                  title="关闭播放队列"
                  @click="closeDrawer"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </header>

            <section v-if="playerStore.songList.length > 0" class="queue-summary">
              <span class="queue-now-label">正在播放</span>
              <strong>{{ currentSongTitle }}</strong>
            </section>

            <div ref="listRef" class="queue-list">
              <div v-if="queueSongs.length === 0" class="queue-empty">
                <span class="queue-empty-mark">LIST</span>
                <strong>播放队列为空</strong>
                <p>播放歌曲后，这里会显示当前正在播放的列表。</p>
              </div>

              <template v-else>
                <article
                  v-for="(item, index) in queueSongs"
                  :key="`${item.platformText}-${item.id}-${index}`"
                  class="queue-item"
                  :class="{ active: item.isCurrent }"
                  :data-current="item.isCurrent ? 'true' : undefined"
                >
                  <button class="queue-item-main" type="button" @click="playSong(index)">
                    <span class="queue-index">
                      <span v-if="!item.isCurrent">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span v-else class="queue-playing-bars" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </span>
                    <span class="queue-cover">
                      <img
                        v-if="item.cover"
                        :src="item.cover"
                        :alt="item.song.name"
                        loading="lazy"
                      />
                    </span>
                    <span class="queue-copy">
                      <span class="queue-title-row">
                        <strong class="queue-title">{{ item.song.name }}</strong>
                        <span class="queue-platform">{{ item.platformText }}</span>
                      </span>
                      <span class="queue-artist">{{ item.artistText || 'Unknown Artist' }}</span>
                    </span>
                    <span class="queue-duration">{{ formatTime(item.duration) }}</span>
                  </button>
                  <button
                    class="queue-remove"
                    type="button"
                    aria-label="从播放队列移除"
                    title="从播放队列移除"
                    @click="removeSong(index)"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </article>
              </template>
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.queue-layer {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.18);
}

.queue-drawer {
  width: min(430px, calc(100vw - 18px));
  height: calc(100vh - 16px);
  margin: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--black);
  background: var(--ui-panel-bg);
  border: var(--ui-border-strong);
  border-radius: var(--ui-card-radius);
  box-shadow: var(--ui-floating-shadow);
}

.queue-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 22px 14px;
  flex-shrink: 0;
}

.queue-heading {
  min-width: 0;
}

.queue-heading h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
}

.queue-heading p {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
  font-weight: 600;
}

.queue-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.queue-icon-button,
.queue-remove {
  border: none;
  background: transparent;
  color: var(--gray);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    color 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease;
}

.queue-icon-button {
  width: 32px;
  height: 32px;
  border-radius: var(--ui-control-radius);
}

.queue-icon-button:hover,
.queue-remove:hover {
  color: var(--accent);
  background: var(--ui-hover-bg);
}

.queue-icon-button:active,
.queue-remove:active {
  transform: scale(0.96);
}

.queue-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
  color: var(--gray);
  background: transparent;
  transform: none;
}

.queue-summary {
  margin: 0 22px 12px;
  padding: 12px 14px;
  border: var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.queue-now-label {
  font-size: 11px;
  color: var(--accent);
  font-weight: 800;
}

.queue-summary strong {
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.queue-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 14px 18px;
}

.queue-list::-webkit-scrollbar {
  width: 8px;
}

.queue-list::-webkit-scrollbar-thumb {
  background: var(--ui-border-color);
  border-radius: 8px;
}

.queue-empty {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  color: var(--gray);
  padding: 24px;
}

.queue-empty-mark {
  width: 56px;
  height: 56px;
  border: var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
}

.queue-empty strong {
  color: var(--black);
  font-size: 14px;
}

.queue-empty p {
  margin: 0;
  max-width: 240px;
  font-size: 12px;
  line-height: 1.5;
}

.queue-item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: center;
  min-height: 72px;
  border-radius: var(--ui-radius-md);
  border: var(--ui-border);
  border-color: transparent;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.queue-item:hover {
  background: var(--ui-hover-bg);
  border-color: var(--ui-border-color);
}

.queue-item.active {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.queue-item-main {
  min-width: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 32px 48px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
  padding: 10px 6px 10px 10px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.queue-index {
  display: inline-flex;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
}

.queue-item.active .queue-index {
  color: var(--accent);
}

.queue-cover {
  width: 48px;
  height: 48px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-track-bg);
  overflow: hidden;
  flex-shrink: 0;
}

.queue-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.queue-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.queue-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.queue-title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.3;
}

.queue-platform {
  padding: 1px 5px;
  border-radius: 2px;
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 900;
  color: var(--accent);
  border: 1px solid currentColor;
}

.queue-artist {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--gray);
}

.queue-item.active .queue-artist {
  color: inherit;
  opacity: 0.72;
}

.queue-duration {
  font-size: 11px;
  font-weight: 700;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.queue-item.active .queue-duration {
  color: inherit;
  opacity: 0.72;
}

.queue-remove {
  width: 28px;
  height: 28px;
  border-radius: var(--ui-control-radius);
  opacity: 0;
}

.queue-item:hover .queue-remove,
.queue-remove:focus-visible {
  opacity: 1;
}

.queue-playing-bars {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 16px;
  height: 16px;
}

.queue-playing-bars span {
  width: 3px;
  background: var(--accent);
  animation: queueSoundWave 0.8s ease-in-out infinite;
}

.queue-playing-bars span:nth-child(1) {
  height: 7px;
}

.queue-playing-bars span:nth-child(2) {
  height: 13px;
  animation-delay: 0.2s;
}

.queue-playing-bars span:nth-child(3) {
  height: 9px;
  animation-delay: 0.4s;
}

.queue-fade-enter-active,
.queue-fade-leave-active {
  transition: opacity 0.16s ease;
}

.queue-fade-enter-from,
.queue-fade-leave-to {
  opacity: 0;
}

.queue-slide-enter-active,
.queue-slide-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.queue-slide-enter-from,
.queue-slide-leave-to {
  opacity: 0;
  transform: translateX(28px);
}

@keyframes queueSoundWave {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.45);
  }
}

@media (max-width: 640px) {
  .queue-layer {
    background: var(--ui-overlay-bg);
  }

  .queue-drawer {
    width: 100vw;
    height: 100vh;
    margin: 0;
    border-radius: 0;
  }

  .queue-header {
    padding: 18px 16px 12px;
  }

  .queue-summary {
    margin: 0 16px 10px;
  }

  .queue-list {
    padding: 0 8px 14px;
  }

  .queue-item-main {
    grid-template-columns: 26px 44px minmax(0, 1fr);
  }

  .queue-duration {
    display: none;
  }
}
</style>
