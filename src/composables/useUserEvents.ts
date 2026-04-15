import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getUserEvent } from '../api/user'
import { createSong, type Song } from '../platform/music/interface'
import { isCanceledRequestError } from '../utils/http/cancelError'
import { createLatestRequestController } from '../utils/http/requestScope'

export interface EventUser {
  nickname?: string
  avatarUrl?: string
}

export interface EventArtist {
  id?: string | number
  name: string
}

export interface EventAlbum {
  id?: string | number
  name?: string
  picUrl?: string
}

export interface EventSong {
  id?: string | number
  name?: string
  album?: EventAlbum | null
  artists?: EventArtist[]
  duration?: number
  platform?: 'netease' | 'qq'
}

export interface EventItem {
  eventId?: string | number
  eventTime?: number | string
  json?: string
  message?: string
  user?: EventUser | null
  song?: EventSong | null
  playableSong?: Song | null
  [key: string]: unknown
}

export type EventFilter = 'all' | 'song'

export interface EventViewModel {
  key: string
  event: EventItem
  message: string
  formattedTime: string
  userName: string
  userAvatarUrl: string
  userAvatarAlt: string
  displaySong: EventSong | Song | null
  songName: string
  songCoverUrl: string
  artistText: string
  playableSong: Song | null
}

export interface EventViewModelCacheEntry {
  event: EventItem
  viewModel: EventViewModel
}

interface UserEventResponse {
  events?: EventItem[]
  lasttime?: number | string
  more?: boolean
}

interface PendingEventRequest {
  userId: number
  limit: number
  lasttime: number
  append: boolean
}

export interface UseUserEventsReturn {
  events: Ref<EventItem[]>
  filteredEvents: ComputedRef<EventItem[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  loadingMore: Ref<boolean>
  error: Ref<unknown>
  hasMore: ComputedRef<boolean>
  activeFilter: Ref<EventFilter>
  formatEventTime: (timestamp: number | string) => string
  getEventMsg: (event: EventItem) => string
  setFilter: (filter: EventFilter) => void
  resetEvents: () => void
  loadEvents: (userId: string | number, limit?: number) => Promise<void>
  loadMoreEvents: () => Promise<void>
  retryLoadEvents: () => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toArtistList(value: unknown): EventArtist[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map(artist => ({
      id: artist.id as string | number | undefined,
      name: typeof artist.name === 'string' ? artist.name : ''
    }))
    .filter(artist => artist.name.length > 0)
}

function toAlbum(value: unknown): EventAlbum | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    id: value.id as string | number | undefined,
    name: typeof value.name === 'string' ? value.name : '',
    picUrl: typeof value.picUrl === 'string' ? value.picUrl : ''
  }
}

function toSongRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function parseEventPayload(rawJson?: string): Record<string, unknown> | null {
  if (!rawJson) {
    return null
  }

  try {
    const parsed = JSON.parse(rawJson) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null
  }

  return toSongRecord(value[key])
}

function extractEventSongSource(
  event: EventItem,
  payload: Record<string, unknown> | null
): Record<string, unknown> | null {
  const candidates = [
    event.song,
    payload?.song,
    payload?.resource,
    getNestedRecord(payload?.resource, 'song'),
    getNestedRecord(getNestedRecord(payload?.resource, 'resourceExtInfo'), 'songData'),
    getNestedRecord(getNestedRecord(payload?.resource, 'resourceExtInfo'), 'song')
  ]

  for (const candidate of candidates) {
    const songRecord = toSongRecord(candidate)
    if (songRecord) {
      return songRecord
    }
  }

  return null
}

function normalizeEventSong(songSource: Record<string, unknown> | null): EventSong | null {
  if (!songSource) {
    return null
  }

  const id = songSource.id as string | number | undefined
  const name =
    typeof songSource.name === 'string'
      ? songSource.name
      : typeof songSource.songName === 'string'
        ? songSource.songName
        : undefined
  const artists = toArtistList(songSource.artists ?? songSource.ar)
  const album = toAlbum(songSource.album ?? songSource.al)
  const duration = toNumber(songSource.duration ?? songSource.dt, 0)
  const platform = songSource.platform === 'qq' ? 'qq' : 'netease'

  if (id === undefined && !name) {
    return null
  }

  return {
    id,
    name,
    artists,
    album,
    duration,
    platform
  }
}

function normalizePlayableSong(songSource: Record<string, unknown> | null): Song | null {
  const normalizedSong = normalizeEventSong(songSource)

  if (!normalizedSong?.name || normalizedSong.id === undefined) {
    return null
  }

  return createSong({
    id: normalizedSong.id,
    name: normalizedSong.name,
    artists: normalizedSong.artists?.map((artist, index) => ({
      id: artist.id ?? `${normalizedSong.id}-artist-${index}`,
      name: artist.name
    })),
    album: {
      id: normalizedSong.album?.id ?? `${normalizedSong.id}-album`,
      name: normalizedSong.album?.name ?? '',
      picUrl: normalizedSong.album?.picUrl ?? ''
    },
    duration: normalizedSong.duration,
    platform: normalizedSong.platform ?? 'netease'
  })
}

function getEventLasttime(
  response: UserEventResponse,
  nextEvents: EventItem[],
  fallback: number
): number {
  if (typeof response.lasttime === 'number') {
    return response.lasttime
  }

  if (typeof response.lasttime === 'string') {
    const parsed = Number(response.lasttime)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  const lastEventTime = nextEvents.at(-1)?.eventTime
  if (typeof lastEventTime === 'number') {
    return lastEventTime
  }

  if (typeof lastEventTime === 'string') {
    const parsed = Number(lastEventTime)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function mergeEvents(currentEvents: EventItem[], nextEvents: EventItem[]): EventItem[] {
  if (currentEvents.length === 0) {
    return nextEvents
  }

  const existingIds = new Set(
    currentEvents.map(event => `${event.eventId ?? event.eventTime ?? JSON.stringify(event)}`)
  )
  const uniqueNextEvents = nextEvents.filter(
    event => !existingIds.has(`${event.eventId ?? event.eventTime ?? JSON.stringify(event)}`)
  )

  return [...currentEvents, ...uniqueNextEvents]
}

export function getEventKey(event: EventItem, index: number): string {
  return String(event.eventId ?? event.eventTime ?? index)
}

export function getEventDisplaySong(event: EventItem): EventSong | Song | null {
  return event.song ?? event.playableSong ?? null
}

export function formatEventArtists(artists?: EventArtist[]): string {
  return artists?.map(artist => artist.name).join(' / ') || ''
}

export function formatEventTimeLabel(
  timestamp: number | string | undefined,
  now = new Date()
): string {
  if (timestamp === undefined) {
    return ''
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

export function createEventViewModel(
  event: EventItem,
  index: number,
  now = new Date()
): EventViewModel {
  const displaySong = getEventDisplaySong(event)

  return {
    key: getEventKey(event, index),
    event,
    message: event.message ?? '',
    formattedTime: formatEventTimeLabel(event.eventTime, now),
    userName: event.user?.nickname ?? '',
    userAvatarUrl: event.user?.avatarUrl ?? '',
    userAvatarAlt: event.user?.nickname ?? '用户头像',
    displaySong,
    songName: displaySong?.name ?? '',
    songCoverUrl: displaySong?.album?.picUrl ?? '',
    artistText: formatEventArtists(displaySong?.artists),
    playableSong: event.playableSong ?? null
  }
}

export function buildCachedEventViewModels(
  events: EventItem[],
  cache: Map<string, EventViewModelCacheEntry>,
  now = new Date()
): EventViewModel[] {
  const nextCache = new Map<string, EventViewModelCacheEntry>()
  const viewModels = events.map((event, index) => {
    const key = getEventKey(event, index)
    const cachedEntry = cache.get(key)
    const viewModel =
      cachedEntry && cachedEntry.event === event
        ? cachedEntry.viewModel
        : createEventViewModel(event, index, now)

    nextCache.set(key, {
      event,
      viewModel
    })

    return viewModel
  })

  cache.clear()
  nextCache.forEach((entry, key) => {
    cache.set(key, entry)
  })

  return viewModels
}

export function useUserEvents(): UseUserEventsReturn {
  const events = ref<EventItem[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<unknown>(null)
  const activeFilter = ref<EventFilter>('all')
  const count = computed(() => events.value.length)
  const filteredEvents = computed(() => {
    if (activeFilter.value === 'song') {
      return events.value.filter(event => Boolean(event.playableSong))
    }

    return events.value
  })
  const hasMoreState = ref(false)
  const currentUserId = ref<number | null>(null)
  const currentLimit = ref(20)
  const nextLasttime = ref(-1)
  const pendingRetryRequest = ref<PendingEventRequest | null>(null)
  const requestController = createLatestRequestController()

  const resetEvents = (): void => {
    requestController.cancel()
    events.value = []
    loading.value = false
    loadingMore.value = false
    error.value = null
    activeFilter.value = 'all'
    hasMoreState.value = false
    currentUserId.value = null
    currentLimit.value = 20
    nextLasttime.value = -1
    pendingRetryRequest.value = null
  }

  const formatEventTime = (timestamp: number | string): string => {
    return formatEventTimeLabel(timestamp)
  }

  const getEventMsg = (event: EventItem): string => {
    if (typeof event.message === 'string') {
      return event.message
    }

    const payload = parseEventPayload(event.json)
    if (!payload) {
      return ''
    }

    return typeof payload.msg === 'string' ? payload.msg : ''
  }

  const setFilter = (filter: EventFilter): void => {
    activeFilter.value = filter
  }

  const normalizeEvent = (event: EventItem): EventItem => {
    const payload = parseEventPayload(event.json)
    const songSource = extractEventSongSource(event, payload)
    const song = normalizeEventSong(songSource)

    return {
      ...event,
      message: getEventMsg(event),
      song,
      playableSong: normalizePlayableSong(songSource)
    }
  }

  const executeLoadEvents = async (request: PendingEventRequest): Promise<void> => {
    const task = requestController.start()
    const requestLoadingState = request.append ? loadingMore : loading

    if (!request.userId) {
      task.commit(() => {
        events.value = []
        loading.value = false
        loadingMore.value = false
        hasMoreState.value = false
      })
      return
    }

    requestLoadingState.value = true
    error.value = null
    pendingRetryRequest.value = null

    try {
      const response = (await task.guard(
        getUserEvent(request.userId, request.limit, request.lasttime)
      )) as UserEventResponse
      const nextEvents = (response.events ?? []).map(normalizeEvent)
      const moreAvailable =
        typeof response.more === 'boolean'
          ? response.more
          : nextEvents.length >= request.limit && nextEvents.length > 0
      const resolvedLasttime = getEventLasttime(response, nextEvents, request.lasttime)

      task.commit(() => {
        currentUserId.value = request.userId
        currentLimit.value = request.limit
        nextLasttime.value = resolvedLasttime
        hasMoreState.value = moreAvailable
        events.value = request.append ? mergeEvents(events.value, nextEvents) : nextEvents
      })
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load user events:', requestError)
      task.commit(() => {
        error.value = requestError
        pendingRetryRequest.value = request
      })
    } finally {
      task.commit(() => {
        requestLoadingState.value = false
      })
    }
  }

  const loadEvents = async (userId: string | number, limit = 20): Promise<void> => {
    const numericUserId = Number(userId)

    if (!numericUserId) {
      resetEvents()
      return
    }

    events.value = []
    hasMoreState.value = false
    nextLasttime.value = -1
    currentUserId.value = numericUserId
    currentLimit.value = limit
    await executeLoadEvents({
      userId: numericUserId,
      limit,
      lasttime: -1,
      append: false
    })
  }

  const loadMoreEvents = async (): Promise<void> => {
    if (currentUserId.value === null || loading.value || loadingMore.value || !hasMoreState.value) {
      return
    }

    await executeLoadEvents({
      userId: currentUserId.value,
      limit: currentLimit.value,
      lasttime: nextLasttime.value,
      append: true
    })
  }

  const retryLoadEvents = async (): Promise<void> => {
    const request = pendingRetryRequest.value

    if (request) {
      await executeLoadEvents(request)
      return
    }

    if (currentUserId.value !== null) {
      await loadEvents(currentUserId.value, currentLimit.value)
    }
  }

  return {
    events,
    filteredEvents,
    count,
    loading,
    loadingMore,
    error,
    hasMore: computed(() => hasMoreState.value),
    activeFilter,
    formatEventTime,
    getEventMsg,
    setFilter,
    resetEvents,
    loadEvents,
    loadMoreEvents,
    retryLoadEvents
  }
}
