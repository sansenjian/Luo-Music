import { ref, computed } from 'vue'
import { getUserEvent } from '../api/user'

export function useUserEvents() {
  const events = ref([])
  const loading = ref(false)
  const error = ref(null)

  const count = computed(() => events.value.length)

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

  const loadEvents = async (userId, limit = 20) => {
    if (!userId) return
    
    loading.value = true
    error.value = null
    
    try {
      const res = await getUserEvent(userId, limit)
      if (res?.events) {
        events.value = res.events
      }
    } catch (e) {
      console.error('获取用户动态失败:', e)
      error.value = e
    } finally {
      loading.value = false
    }
  }

  return {
    events,
    count,
    loading,
    error,
    formatEventTime,
    getEventMsg,
    loadEvents,
  }
}
