<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'
import { usePlaylistStore } from '../store/playlistStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserData } from '../composables/useUserData'
import { useLikedSongs } from '../composables/useLikedSongs'
import { useUserPlaylists } from '../composables/useUserPlaylists'
import { useUserEvents } from '../composables/useUserEvents'
import { formatSongs } from '../utils/songFormatter'
import UserProfileHeader from '../components/user/UserProfileHeader.vue'
import LikedSongsView from '../components/user/LikedSongsView.vue'
import PlaylistsView from '../components/user/PlaylistsView.vue'
import EventsView from '../components/user/EventsView.vue'

const router = useRouter()
const userStore = useUserStore()
const playlistStore = usePlaylistStore()
const playerStore = usePlayerStore()

const activeTab = ref('liked')
const loadingMap = ref({
  liked: false,
  playlist: false,
  events: false,
})

// Use composables for data fetching
const { stats, loadUserData } = useUserData(userStore.userId)
const { formattedSongs, count: likedCount, loadLikedSongs } = useLikedSongs()
const { playlists, count: playlistCount, loadPlaylists, loadPlaylistSongs } = useUserPlaylists()
const { events, count: eventsCount, loadEvents } = useUserEvents()

// Tab counts
const tabCounts = computed(() => ({
  liked: likedCount.value,
  playlist: playlistCount.value,
  events: eventsCount.value,
}))

// Load all data on mount
const loadAllData = async () => {
  if (!userStore.isLoggedIn) {
    router.push('/')
    return
  }
  
  const userId = userStore.userId
  
  // 独立设置每个 tab 的加载状态
  loadingMap.value.liked = true
  loadingMap.value.playlist = true
  loadingMap.value.events = true
  
  await Promise.all([
    loadUserData(),
    loadLikedSongs(userId).finally(() => loadingMap.value.liked = false),
    loadPlaylists(userId).finally(() => loadingMap.value.playlist = false),
    loadEvents(userId).finally(() => loadingMap.value.events = false),
  ])
}

// Initial load
loadAllData()

// Event handlers
const handlePlaylistClick = async (playlistId) => {
  loadingMap.value.playlist = true
  try {
    const songs = await loadPlaylistSongs(playlistId)
    if (songs.length > 0) {
      playlistStore.setPlaylist(songs)
      playerStore.setSongList(songs)
      try {
        await playerStore.playSongWithDetails(0)
        router.push('/')
      } catch (playError) {
        console.error('播放失败:', playError)
        // 播放失败不跳转，保留当前页面
      }
    }
  } catch (error) {
    console.error('获取歌单详情失败:', error)
  } finally {
    loadingMap.value.playlist = false
  }
}

const handlePlayAllLiked = async () => {
  const songs = formattedSongs.value
  if (songs.length > 0) {
    playlistStore.setPlaylist(songs)
    playerStore.setSongList(songs)
    try {
      await playerStore.playSongWithDetails(0)
      router.push('/')
    } catch (error) {
      console.error('播放失败:', error)
    }
  }
}

const handlePlayLikedSong = async (index) => {
  const songs = formattedSongs.value
  playlistStore.setPlaylist(songs)
  playerStore.setSongList(songs)
  try {
    await playerStore.playSongWithDetails(index)
    router.push('/')
  } catch (error) {
    console.error('播放失败:', error)
  }
}

const goBack = () => {
  router.push('/')
}
</script>

<template>
  <div class="user-center-page">
    <div class="user-center-header">
      <button class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5"></path>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回
      </button>
    </div>

    <div class="user-center-content">
      <UserProfileHeader 
        :user-id="userStore.userId"
        :avatar-url="userStore.avatarUrl"
        :nickname="userStore.nickname"
      />

      <section class="content-section">
        <div class="section-header">
          <div class="tabs">
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'liked' }"
              @click="activeTab = 'liked'"
            >
              我喜欢的音乐
              <span v-if="tabCounts.liked > 0" class="count">{{ tabCounts.liked }}</span>
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'playlist' }"
              @click="activeTab = 'playlist'"
            >
              歌单
              <span v-if="tabCounts.playlist > 0" class="count">{{ tabCounts.playlist }}</span>
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'events' }"
              @click="activeTab = 'events'"
            >
              动态
              <span v-if="tabCounts.events > 0" class="count">{{ tabCounts.events }}</span>
            </button>
          </div>
        </div>

        <div v-if="loadingMap[activeTab]" class="loading-container">
          <p>加载中...</p>
        </div>

        <template v-else>
          <LikedSongsView
            v-show="activeTab === 'liked'"
            :like-songs="formattedSongs"
            :loading="loadingMap.liked"
            @play-all="handlePlayAllLiked"
            @play-song="handlePlayLikedSong"
          />
          
          <PlaylistsView
            v-show="activeTab === 'playlist'"
            :playlists="playlists"
            :loading="loadingMap.playlist"
            @playlist-click="handlePlaylistClick"
          />
          
          <EventsView
            v-show="activeTab === 'events'"
            :events="events"
            :loading="loadingMap.events"
          />
        </template>
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

.tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-dark);
  padding: 4px;
  border-radius: 12px;
  border: 2px solid var(--black);
  width: fit-content;
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

.loading-container {
  text-align: center;
  padding: 60px 20px;
  font-size: 16px;
  color: var(--gray);
}

@media (max-width: 768px) {
  .tabs {
    width: 100%;
    border-radius: 10px;
  }

  .tab-btn {
    flex: 1;
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
