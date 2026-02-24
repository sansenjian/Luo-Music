<script setup>
const props = defineProps({
  events: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const formatEventTime = (timestamp) => {
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

const getEventMsg = (event) => {
  if (!event.json) return ''
  try {
    const data = JSON.parse(event.json)
    return data.msg || ''
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="events-section">
    <div v-if="loading" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="events.length === 0" class="empty-state">
      <p>暂无动态</p>
    </div>

    <div v-else class="events-list">
      <div 
        v-for="event in events" 
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
</template>

<style scoped>
.events-section {
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0 var(--black);
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
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  color: var(--gray);
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
</style>
