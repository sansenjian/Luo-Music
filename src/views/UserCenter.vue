<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'
import { usePlaylistStore } from '../store/playlistStore'
import { usePlayerStore } from '../store/playerStore'
import { getUserPlaylist, getPlaylistDetail } from '../api/playlist'
import { getLikelist, getSongDetail } from '../api/song'
import { getUserDetail, getUserSubcount, getUserLevel, getUserEvent } from '../api/user'

const router = useRouter()
const userStore = useUserStore()
const playlistStore = usePlaylistStore()
const playerStore = usePlayerStore()
const loading = ref(false)
const playlists = ref([])
const likeSongs = ref([])
const activeTab = ref('liked')
const userDetail = ref(null)
const userSubcount = ref(null)
const userLevel = ref(null)
const userEvents = ref([])

onMounted(async () => {
  if (userStore.isLoggedIn) {
    await Promise.all([
      loadPlaylists(),
      loadLikeSongs(),
      loadUserDetail(),
      loadUserSubcount(),
      loadUserLevel(),
      loadUserEvents()
    ])
  } else {
    router.push('/')
  }
})

async function loadUserDetail() {
  try {
    const res = await getUserDetail(userStore.userId)
    if (res) {
      userDetail.value = res
    }
  } catch (error) {
    console.error('获取用户详情失败:', error)
  }
}

async function loadUserSubcount() {
  try {
    const res = await getUserSubcount()
    if (res) {
      userSubcount.value = res
    }
  } catch (error) {
    console.error('获取用户订阅数失败:', error)
  }
}

async function loadUserLevel() {
  try {
    const res = await getUserLevel()
    if (res) {
      userLevel.value = res
    }
  } catch (error) {
    console.error('获取用户等级失败:', error)
  }
}

async function loadUserEvents() {
  try {
    const res = await getUserEvent(userStore.userId, 20)
    if (res?.events) {
      userEvents.value = res.events
    }
  } catch (error) {
    console.error('获取用户动态失败:', error)
  }
}

async function loadPlaylists() {
  try {
    const res = await getUserPlaylist(userStore.userId)
    if (res?.playlist) {
      playlists.value = res.playlist
    }
  } catch (error) {
    console.error('获取歌单失败:', error)
  }
}

async function loadLikeSongs() {
  loading.value = true
  try {
    const res = await getLikelist(userStore.userId)
    if (res?.ids?.length > 0) {
      const ids = res.ids.slice(0, 100)
      const detailRes = await getSongDetail(ids.join(','))
      if (detailRes?.songs) {
        const songMap = new Map(detailRes.songs.map(s => [s.id, s]))
        likeSongs.value = ids.map(id => songMap.get(id)).filter(Boolean)
      }
    }
  } catch (error) {
    console.error('获取喜欢歌曲失败:', error)
  } finally {
    loading.value = false
  }
}

function formatSongs(songs) {
  return songs.map((song, idx) => ({
    index: idx,
    id: song.id,
    name: song.name,
    artist: song.ar?.map(a => a.name).join(' / ') || '未知歌手',
    album: song.al?.name || '',
    cover: song.al?.picUrl || '',
    duration: Math.floor((song.dt || 0) / 1000)
  }))
}

async function handlePlaylistClick(playlistId) {
  loading.value = true
  try {
    const res = await getPlaylistDetail(playlistId)
    if (res?.playlist?.tracks) {
      const formattedSongs = formatSongs(res.playlist.tracks)
      playlistStore.setPlaylist(formattedSongs)
      playerStore.setSongList(formattedSongs)
      await playerStore.playSongWithDetails(0)
      router.push('/')
    }
  } catch (error) {
    console.error('获取歌单详情失败:', error)
  } finally {
    loading.value = false
  }
}

async function playLikeSongs() {
  if (likeSongs.value.length > 0) {
    const formattedSongs = formatSongs(likeSongs.value)
    playlistStore.setPlaylist(formattedSongs)
    playerStore.setSongList(formattedSongs)
    await playerStore.playSongWithDetails(0)
    router.push('/')
  }
}

async function playSong(index) {
  const formattedSongs = formatSongs(likeSongs.value)
  playlistStore.setPlaylist(formattedSongs)
  playerStore.setSongList(formattedSongs)
  await playerStore.playSongWithDetails(index)
  router.push('/')
}

function goBack() {
  router.push('/')
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatEventTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function getEventMsg(event) {
  if (!event.json) return ''
  try {
    const data = JSON.parse(event.json)
    return data.msg || ''
  } catch (e) {
    return ''
  }
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
      <section class="user-profile-section">
        <div 
          class="user-profile-bg" 
          :class="{ 'has-custom-bg': userDetail?.profile?.backgroundUrl }"
          :style="userDetail?.profile?.backgroundUrl ? { 
            backgroundImage: `linear-gradient(135deg, rgba(255, 126, 95, 0.3), rgba(254, 180, 123, 0.3)), url(${userDetail.profile.backgroundUrl})` 
          } : {}"
        ></div>
        <div class="user-profile-info">
          <div class="user-avatar-container">
            <img 
              v-if="userStore.avatarUrl" 
              :src="userStore.avatarUrl" 
              :alt="userStore.nickname" 
              class="user-avatar"
            />
          </div>
          <div class="user-details">
            <div class="user-name-row">
              <h1 class="user-nickname">{{ userDetail?.profile?.nickname || userStore.nickname || '未知用户' }}</h1>
              <span v-if="userLevel?.data?.level" class="user-level">Lv.{{ userLevel.data.level }}</span>
              <svg v-if="userDetail?.profile?.vipType > 0" class="vip-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div class="user-stats">
              <div class="stat-item">
                <span class="stat-value">{{ userSubcount?.createdPlaylistCount || 0 }}</span>
                <span class="stat-label">歌单</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-item">
                <span class="stat-value">{{ userDetail?.profile?.follows || 0 }}</span>
                <span class="stat-label">关注</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-item">
                <span class="stat-value">{{ userDetail?.profile?.followeds || 0 }}</span>
                <span class="stat-label">粉丝</span>
              </div>
            </div>
            <p v-if="userDetail?.profile?.signature" class="user-signature">{{ userDetail.profile.signature }}</p>
          </div>
        </div>
      </section>

      <section class="content-section">
        <div class="section-header">
          <div class="tabs">
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'liked' }"
              @click="activeTab = 'liked'"
            >
              我喜欢的音乐
              <span v-if="likeSongs.length > 0" class="count">{{ likeSongs.length }}</span>
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'playlist' }"
              @click="activeTab = 'playlist'"
            >
              歌单
              <span v-if="playlists.length > 0" class="count">{{ playlists.length }}</span>
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'events' }"
              @click="activeTab = 'events'"
            >
              动态
              <span v-if="userEvents.length > 0" class="count">{{ userEvents.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'liked'" class="liked-songs-section">
          <div v-if="loading" class="loading-container">
            <p>加载中...</p>
          </div>

          <div v-else-if="likeSongs.length === 0" class="empty-state">
            <p>暂无喜欢的音乐</p>
          </div>

          <template v-else>
            <div class="play-all-btn" @click="playLikeSongs">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"></path>
              </svg>
              播放全部
            </div>
            
            <div class="songs-list">
              <div 
                v-for="(song, index) in likeSongs" 
                :key="song.id" 
                class="song-item"
                @click="playSong(index)"
              >
                <span class="song-index">{{ index + 1 }}</span>
                <div class="song-cover">
                  <img :src="song.al?.picUrl" :alt="song.name" />
                  <div class="song-play-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  </div>
                </div>
                <div class="song-info">
                  <h4 class="song-name">{{ song.name }}</h4>
                  <p class="song-artist">
                    {{ song.ar?.map(a => a.name).join(' / ') || '未知歌手' }}
                  </p>
                </div>
                <span class="song-album">{{ song.al?.name || '' }}</span>
                <span class="song-duration">{{ formatDuration(song.dt) }}</span>
              </div>
            </div>
          </template>
        </div>

        <div v-if="activeTab === 'playlist'" class="playlists-section">
          <div v-if="loading" class="loading-container">
            <p>加载中...</p>
          </div>

          <div v-else-if="playlists.length === 0" class="empty-state">
            <p>暂无歌单</p>
          </div>

          <div v-else class="playlists-grid">
            <div 
              v-for="playlist in playlists" 
              :key="playlist.id" 
              class="playlist-card"
              @click="handlePlaylistClick(playlist.id)"
            >
              <div class="playlist-cover">
                <img :src="playlist.coverImgUrl" :alt="playlist.name" />
                <div class="playlist-overlay">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"></path>
                  </svg>
                </div>
                <span v-if="playlist.playCount > 0" class="play-count">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"></path>
                  </svg>
                  {{ playlist.playCount > 10000 ? (playlist.playCount / 10000).toFixed(1) + '万' : playlist.playCount }}
                </span>
              </div>
              <div class="playlist-info">
                <h3 class="playlist-name">{{ playlist.name }}</h3>
                <p class="playlist-count">{{ playlist.trackCount }} 首</p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'events'" class="events-section">
          <div v-if="userEvents.length === 0" class="empty-state">
            <p>暂无动态</p>
          </div>

          <div v-else class="events-list">
            <div 
              v-for="(event, index) in userEvents" 
              :key="event.eventId" 
              class="event-item"
            >
              <div class="event-header">
                <img class="event-user-avatar" :src="event.user?.avatarUrl" :alt="event.user?.nickname" />
                <div class="event-user-info">
                  <span class="event-user-name">{{ event.user?.nickname }}</span>
                  <span class="event-time">{{ formatEventTime(event.eventTime) }}</span>
                </div>
              </div>
              <div class="event-content" v-if="event.json && getEventMsg(event)">
                <p>{{ getEventMsg(event) }}</p>
              </div>
              <div class="event-song" v-if="event.song">
                <img class="event-song-cover" :src="event.song.album?.picUrl" :alt="event.song.name" />
                <div class="event-song-info">
                  <span class="event-song-name">{{ event.song.name }}</span>
                  <span class="event-song-artist">{{ event.song.artists?.map(a => a.name).join(' / ') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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

.user-profile-section {
  position: relative;
  margin-bottom: 32px;
}

.user-profile-bg {
  height: 280px;
  background-image: linear-gradient(135deg, #ff7e5f, #feb47b);
  background-size: cover;
  background-position: center;
  position: relative;
}

.user-profile-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%);
}

.user-profile-bg.has-custom-bg {
  animation: none;
}

.user-profile-info {
  max-width: 1200px;
  margin: -80px auto 0;
  padding: 0 20px 24px;
  display: flex;
  align-items: flex-end;
  gap: 24px;
  position: relative;
  z-index: 10;
}

.user-avatar-container {
  flex-shrink: 0;
}

.user-avatar {
  width: 160px;
  height: 160px;
  border-radius: 12px;
  border: 4px solid var(--white);
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  background: var(--white);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.user-avatar:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.user-details {
  flex: 1;
  padding-bottom: 12px;
  color: var(--black);
  min-width: 0;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.user-nickname {
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 800;
  color: var(--black);
  letter-spacing: -0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-level {
  padding: 4px 10px;
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  color: var(--white);
  font-size: 12px;
  font-weight: 700;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
}

.vip-icon {
  color: #ff4757;
  filter: drop-shadow(0 2px 4px rgba(255, 71, 87, 0.3));
}

.user-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  border-radius: 8px;
  transition: background 0.2s ease;
  cursor: pointer;
}

.stat-item:hover {
  background: var(--bg-dark);
}

.stat-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--black);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--gray);
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(to bottom, transparent, var(--gray-light), transparent);
}

.user-signature {
  margin: 0;
  font-size: 14px;
  color: var(--gray);
  max-width: 600px;
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

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background: var(--white);
  border: 2px dashed var(--gray-light);
  border-radius: 12px;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  color: var(--gray);
}

.play-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  background: var(--accent);
  color: var(--white);
  border: 2px solid var(--black);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 24px;
  transition: all 0.2s ease;
  box-shadow: 4px 4px 0 var(--black);
}

.play-all-btn:hover {
  background: #e55a2b;
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--black);
}

.play-all-btn:active {
  transform: translate(0, 0);
  box-shadow: 2px 2px 0 var(--black);
}

.songs-list {
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0 var(--black);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--bg-dark);
  transition: all 0.2s ease;
  gap: 16px;
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

.song-index {
  width: 32px;
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
  position: relative;
  border: 2px solid var(--black);
  transition: transform 0.2s ease;
}

.song-item:hover .song-cover {
  transform: scale(1.05);
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  flex: 1;
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
}

.playlists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 28px;
}

.playlist-card {
  cursor: pointer;
  transition: all 0.3s ease;
}

.playlist-card:hover {
  transform: translateY(-8px);
}

.playlist-card:hover .playlist-cover {
  box-shadow: 8px 8px 0 var(--black);
}

.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid var(--black);
  overflow: hidden;
  background: var(--white);
  margin-bottom: 12px;
  border-radius: 12px;
  box-shadow: 4px 4px 0 var(--black);
  transition: all 0.3s ease;
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.3s ease;
  color: var(--white);
  backdrop-filter: blur(2px);
}

.playlist-card:hover .playlist-overlay {
  opacity: 1;
}

.playlist-overlay svg {
  transform: scale(0.8);
  transition: transform 0.3s ease;
}

.playlist-card:hover .playlist-overlay svg {
  transform: scale(1);
}

.play-count {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--white);
  font-size: 12px;
  border-radius: 12px;
}

.playlist-info {
  padding: 0 4px;
}

.playlist-name {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.playlist-count {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
}

.events-section {
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0 var(--black);
}

.events-list {
  padding: 16px;
}

.event-item {
  padding: 20px;
  border-bottom: 1px solid var(--bg-dark);
  transition: background 0.2s ease;
}

.event-item:hover {
  background: var(--bg);
}

.event-item:last-child {
  border-bottom: none;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.event-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--black);
  box-shadow: 2px 2px 0 var(--black);
}

.event-user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.event-time {
  font-size: 12px;
  color: var(--gray);
}

.event-content {
  margin-bottom: 12px;
}

.event-content p {
  margin: 0;
  font-size: 14px;
  color: var(--black);
  line-height: 1.6;
}

.event-song {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 2px solid var(--black);
  transition: all 0.2s ease;
}

.event-song:hover {
  background: var(--white);
  box-shadow: 2px 2px 0 var(--black);
}

.event-song-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
}

.event-song-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-song-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.event-song-artist {
  font-size: 12px;
  color: var(--gray);
}

@media (max-width: 768px) {
  .user-profile-bg {
    height: 200px;
  }

  .user-profile-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-top: -50px;
  }

  .user-avatar {
    width: 100px;
    height: 100px;
    border-radius: 8px;
  }

  .user-nickname {
    font-size: 22px;
  }

  .user-name-row {
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .user-stats {
    gap: 8px;
  }

  .stat-item {
    padding: 6px 12px;
  }

  .stat-value {
    font-size: 18px;
  }

  .song-album {
    display: none;
  }

  .song-item {
    padding: 12px 16px;
    gap: 12px;
  }

  .song-cover {
    width: 44px;
    height: 44px;
  }

  .playlists-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

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

  .play-all-btn {
    width: 100%;
    justify-content: center;
    box-shadow: 3px 3px 0 var(--black);
  }

  .songs-list,
  .events-section {
    box-shadow: 3px 3px 0 var(--black);
  }
}
</style>
