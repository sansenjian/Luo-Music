<script setup lang="ts">
import { formatDuration } from '@/utils/songFormatter'

import { useHomeRecentPlayPanel } from '@/composables/home/useHomeRecentPlayPanel'

const {
  clearRecentSongs,
  clearSearch,
  filteredItems,
  hasRecentSongs,
  isCurrentSong,
  lastPlayedAt,
  playAllRecentSongs,
  playRecentSongAt,
  removeRecentSong,
  searchQuery,
  totalCount
} = useHomeRecentPlayPanel()

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit'
})
const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit'
})
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric'
})

function formatLastPlayedCopy(playedAt: number | null): string {
  if (!playedAt) {
    return '从播放列表、收藏或本地音乐开始播放，记录会出现在这里。'
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - playedAt) / 60000))
  if (elapsedMinutes < 1) {
    return '刚刚播放过一首歌'
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} 分钟前播放过一首歌`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours} 小时前播放过一首歌`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays === 1) {
    return '昨天还在继续收听'
  }

  if (elapsedDays < 30) {
    return `${elapsedDays} 天前有新的播放记录`
  }

  return `最近一次播放在 ${monthDayFormatter.format(new Date(playedAt))}`
}

function formatPlayedAtLabel(playedAt: number): string {
  const playedDate = new Date(playedAt)
  const now = new Date()
  const isSameYear = playedDate.getFullYear() === now.getFullYear()
  const isSameDay =
    isSameYear && playedDate.getMonth() === now.getMonth() && playedDate.getDate() === now.getDate()

  if (isSameDay) {
    return timeFormatter.format(playedDate)
  }

  return isSameYear ? monthDayFormatter.format(playedDate) : fullDateFormatter.format(playedDate)
}
</script>

<template>
  <section class="recent-panel">
    <div class="recent-shell">
      <div class="recent-topbar">
        <div class="recent-tabs" aria-label="最近播放类型">
          <button type="button" class="recent-tab recent-tab-active" disabled>
            单曲
            <span>{{ totalCount }}</span>
          </button>
        </div>

        <div class="recent-actions">
          <button
            type="button"
            class="recent-action recent-action-primary"
            :disabled="filteredItems.length === 0"
            @click="playAllRecentSongs"
          >
            播放全部
          </button>
          <button
            type="button"
            class="recent-action"
            :disabled="!hasRecentSongs"
            @click="clearRecentSongs"
          >
            清空记录
          </button>
        </div>
      </div>

      <section class="recent-header">
        <div class="recent-header-copy">
          <h1>最近播放</h1>
          <p>{{ formatLastPlayedCopy(lastPlayedAt) }}</p>
        </div>

        <label class="recent-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input v-model="searchQuery" type="search" placeholder="搜索歌曲、歌手或专辑" />
          <button
            v-if="searchQuery"
            type="button"
            class="recent-search-clear"
            aria-label="清空搜索"
            @click="clearSearch"
          >
            ×
          </button>
        </label>
      </section>

      <section class="recent-table-shell">
        <div v-if="filteredItems.length === 0" class="recent-empty-state">
          <div class="recent-empty-icon">{{ hasRecentSongs ? '?' : '♪' }}</div>
          <h2>{{ hasRecentSongs ? '没有匹配的最近播放' : '还没有最近播放记录' }}</h2>
          <p>
            {{
              hasRecentSongs
                ? '试试更短的关键词，或者清空搜索后查看全部记录。'
                : '从主页、我的喜欢或本地音乐开始播放后，这里会自动累积你的听歌轨迹。'
            }}
          </p>
        </div>

        <div v-else class="recent-table">
          <div class="recent-table-head">
            <span class="col-index">#</span>
            <span class="col-title">标题</span>
            <span class="col-album">专辑</span>
            <span class="col-action">操作</span>
            <span class="col-played">播放时间</span>
          </div>

          <div
            v-for="(item, index) in filteredItems"
            :key="`${item.identityKey}-${item.playedAt}`"
            class="recent-row"
            :class="{ active: isCurrentSong(item.song) }"
          >
            <button type="button" class="recent-row-main" @click="playRecentSongAt(index)">
              <span class="recent-row-index">
                {{ isCurrentSong(item.song) ? '▶' : String(index + 1).padStart(2, '0') }}
              </span>

              <span class="recent-row-title">
                <img
                  v-if="item.cover"
                  :src="item.cover"
                  :alt="item.name"
                  class="recent-row-cover"
                />
                <div v-else class="recent-row-cover recent-row-cover-fallback" aria-hidden="true">
                  ♪
                </div>

                <span class="recent-row-copy">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.artist }} · {{ formatDuration(item.durationMs) }}</span>
                </span>
              </span>

              <span class="recent-row-album">{{ item.album || '单曲' }}</span>
            </button>

            <button
              type="button"
              class="recent-row-remove"
              :aria-label="`从最近播放移除 ${item.name}`"
              @click="removeRecentSong(item.song)"
            >
              移除
            </button>

            <span class="recent-row-played">{{ formatPlayedAtLabel(item.playedAt) }}</span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.recent-panel {
  height: 100%;
  overflow-y: auto;
  color: var(--black);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.48)),
    radial-gradient(circle at top left, var(--sidebar-shell-glow), transparent 26%),
    var(--sidebar-shell-bg);
}

.recent-shell {
  min-height: 100%;
  padding: 22px 30px 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.recent-topbar,
.recent-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
}

.recent-header {
  align-items: end;
}

.recent-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.recent-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 9px 16px;
  border: none;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--gray);
  font-size: 14px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
}

.recent-tab span {
  font-size: 12px;
  opacity: 0.72;
}

.recent-tab:disabled {
  opacity: 1;
}

.recent-tab-active {
  background: var(--sidebar-active-bg);
  color: var(--white);
  box-shadow: var(--sidebar-active-shadow);
}

.recent-header-copy {
  min-width: 0;
}

.recent-header-copy h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.05;
  color: var(--black);
}

.recent-header-copy p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gray);
}

.recent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.recent-action {
  min-height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--gray);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.recent-action:hover:not(:disabled) {
  background: var(--sidebar-link-hover-bg);
  transform: translateY(-1px);
}

.recent-action:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.recent-action-primary {
  background: var(--sidebar-active-bg);
  color: var(--white);
  box-shadow: var(--sidebar-active-shadow);
}

.recent-action-primary:hover:not(:disabled) {
  background: var(--sidebar-active-bg);
}

.recent-search {
  min-width: min(100%, 300px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 42px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-soft) 90%, var(--white));
}

.recent-search svg {
  width: 16px;
  height: 16px;
  color: var(--gray-light);
}

.recent-search input {
  flex: 1;
  min-width: 0;
  min-height: 38px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--black);
}

.recent-search-clear {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--sidebar-link-hover-bg);
  color: var(--gray);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.recent-search-clear:hover {
  background: var(--sidebar-active-bg);
  color: var(--white);
}

.recent-table-shell {
  min-height: 0;
  padding: 14px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: calc(var(--sidebar-link-radius) + 12px);
  background: color-mix(in srgb, var(--surface-soft) 92%, var(--white));
  box-shadow: 0 18px 36px var(--theme-panel-glow);
}

.recent-empty-state {
  min-height: 300px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--gray);
}

.recent-empty-icon {
  width: 62px;
  height: 62px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
  border: 1px solid var(--sidebar-note-border);
  border-radius: calc(var(--sidebar-link-radius) + 8px);
  background: var(--surface-muted);
  font-size: 28px;
  font-weight: 700;
  color: var(--sidebar-note-text);
}

.recent-empty-state h2 {
  margin: 0;
  font-size: 22px;
  color: var(--black);
}

.recent-empty-state p {
  max-width: 440px;
  margin: 10px auto 0;
  line-height: 1.7;
}

.recent-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-table-head {
  display: grid;
  grid-template-columns: 56px minmax(0, 1.8fr) minmax(160px, 1fr) 88px 110px;
  gap: 16px;
  align-items: center;
  padding: 0 14px 12px;
  color: var(--gray-light);
  font-size: 13px;
  font-weight: 700;
  border-bottom: 1px solid var(--gray-lighter);
}

.recent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px 110px;
  gap: 16px;
  align-items: center;
  min-height: 76px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: calc(var(--sidebar-link-radius) + 8px);
  background: transparent;
  transition:
    background 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.recent-row:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.recent-row.active {
  border-color: var(--sidebar-card-active-border);
  background: var(--sidebar-active-bg);
  box-shadow: var(--sidebar-card-active-shadow);
  color: var(--white);
}

.recent-row-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 56px minmax(0, 1.8fr) minmax(160px, 1fr);
  gap: 16px;
  align-items: center;
  min-height: 76px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.recent-row-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--gray-light);
  font-variant-numeric: tabular-nums;
}

.recent-row.active .recent-row-index {
  color: var(--white);
}

.recent-row-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.recent-row-cover {
  width: 42px;
  height: 42px;
  border-radius: calc(var(--sidebar-link-radius) + 6px);
  object-fit: cover;
  background: color-mix(in srgb, var(--surface-soft) 88%, var(--white));
}

.recent-row-cover-fallback {
  display: grid;
  place-items: center;
  font-size: 18px;
  color: var(--gray);
  background: var(--surface-muted);
}

.recent-row-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.recent-row-copy strong,
.recent-row-copy span,
.recent-row-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-row-copy strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--black);
}

.recent-row-copy span,
.recent-row-album {
  font-size: 13px;
  color: var(--gray);
}

.recent-row.active .recent-row-copy strong {
  color: var(--white);
}

.recent-row.active .recent-row-copy span,
.recent-row.active .recent-row-album,
.recent-row.active .recent-row-played {
  color: rgba(255, 255, 255, 0.8);
}

.recent-row-remove {
  width: 72px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--gray);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.recent-row-remove:hover {
  background: var(--sidebar-link-hover-bg);
  color: var(--black);
}

.recent-row.active .recent-row-remove {
  background: rgba(255, 255, 255, 0.16);
  color: var(--white);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.recent-row.active .recent-row-remove:hover {
  background: rgba(255, 255, 255, 0.24);
}

.recent-row-played {
  font-size: 13px;
  color: var(--gray-light);
}

@media (max-width: 1180px) {
  .recent-table-head {
    grid-template-columns: 56px minmax(0, 1fr) 88px 100px;
  }

  .recent-row {
    grid-template-columns: minmax(0, 1fr) 88px 100px;
  }

  .recent-row-main {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .col-album,
  .recent-row-album {
    display: none;
  }
}

@media (max-width: 900px) {
  .recent-shell {
    padding: 18px 16px 28px;
  }

  .recent-topbar,
  .recent-header {
    flex-direction: column;
    align-items: stretch;
  }

  .recent-actions {
    justify-content: flex-start;
  }

  .recent-search {
    min-width: 0;
  }

  .recent-table-head {
    grid-template-columns: 40px minmax(0, 1fr) 88px;
    gap: 12px;
    padding: 0 10px 10px;
  }

  .recent-row {
    grid-template-columns: minmax(0, 1fr) 88px;
    gap: 10px;
    padding: 0 10px;
  }

  .recent-row-main {
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 12px;
    min-height: 68px;
  }

  .col-played,
  .recent-row-played {
    display: none;
  }

  .recent-row-remove {
    width: 64px;
  }
}
</style>
