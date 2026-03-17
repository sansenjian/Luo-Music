import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getUserEvent } from '../api/user'

export interface EventItem {
  json?: string
  [key: string]: unknown
}

export interface UseUserEventsReturn {
  events: Ref<EventItem[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  error: Ref<unknown>
  formatEventTime: (timestamp: number | string) => string
  getEventMsg: (event: EventItem) => string
  loadEvents: (userId: string | number, limit?: number) => Promise<void>
}

export function useUserEvents(): UseUserEventsReturn {
  const events = ref<EventItem[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const count = computed(() => events.value.length)

  const formatEventTime = (timestamp: number | string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  const getEventMsg = (event: EventItem): string => {
    if (!event.json) {
      return ''
    }

    try {
      const data = JSON.parse(event.json) as { msg?: string }
      return data.msg || ''
    } catch {
      return ''
    }
  }

  const loadEvents = async (userId: string | number, limit = 20): Promise<void> => {
    if (!userId) {
      return
    }

    loading.value = true
    error.value = null

    try {
      const response = (await getUserEvent(Number(userId), limit)) as { events?: EventItem[] }
      events.value = response.events ?? []
    } catch (requestError) {
      console.error('获取用户动态失败:', requestError)
      error.value = requestError
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
    loadEvents
  }
}
