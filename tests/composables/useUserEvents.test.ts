import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildCachedEventViewModels,
  createEventViewModel,
  formatEventTimeLabel,
  useUserEvents,
  type EventViewModelCacheEntry,
  type UseUserEventsReturn
} from '@/composables/useUserEvents'
import { createDeferred } from '../helpers/deferred'
import { mountComposable } from '../helpers/mountComposable'
import { createMockSong } from '../utils/test-utils'

const getUserEventMock = vi.hoisted(() => vi.fn())
const isCanceledRequestErrorMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('@/api/user', () => ({
  getUserEvent: getUserEventMock
}))

vi.mock('@/utils/http/cancelError', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/http/cancelError')>()

  return {
    ...actual,
    isCanceledRequestError: isCanceledRequestErrorMock
  }
})

function mountUseUserEvents() {
  const { result } = mountComposable<UseUserEventsReturn>(() => useUserEvents())
  return result
}

describe('useUserEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes loaded events with parsed message and playable song data', async () => {
    getUserEventMock.mockResolvedValue({
      events: [
        {
          eventId: 1,
          json: JSON.stringify({
            msg: 'parsed message',
            song: {
              id: 101,
              name: 'Parsed Song',
              artists: [{ id: 7, name: 'Artist 7' }],
              album: { id: 9, name: 'Album 9', picUrl: 'cover-9.jpg' },
              duration: 189000
            }
          })
        }
      ],
      more: false,
      lasttime: 1000
    })

    const viewModel = mountUseUserEvents()
    await viewModel.loadEvents(1)
    await flushPromises()

    expect(viewModel.events.value).toHaveLength(1)
    expect(viewModel.events.value[0]).toMatchObject({
      eventId: 1,
      message: 'parsed message',
      song: {
        id: 101,
        name: 'Parsed Song',
        artists: [{ id: 7, name: 'Artist 7' }],
        album: { id: 9, name: 'Album 9', picUrl: 'cover-9.jpg' }
      }
    })
    expect(viewModel.events.value[0]?.playableSong).toMatchObject({
      id: 101,
      name: 'Parsed Song',
      artists: [{ id: 7, name: 'Artist 7' }],
      album: { id: 9, name: 'Album 9', picUrl: 'cover-9.jpg' },
      platform: 'netease'
    })

    viewModel.setFilter('song')

    expect(viewModel.filteredEvents.value).toHaveLength(1)
    expect(viewModel.activeFilter.value).toBe('song')
  })

  it('returns an empty message when raw event json is invalid', () => {
    const { getEventMsg } = useUserEvents()

    expect(getEventMsg({ json: '{bad json' })).toBe('')
  })

  it('prefers an already normalized message field', () => {
    const { getEventMsg } = useUserEvents()

    expect(
      getEventMsg({
        message: 'normalized message',
        json: JSON.stringify({ msg: 'stale message' })
      })
    ).toBe('normalized message')
  })

  it('builds stable event view models for the template hot path', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const playableSong = createMockSong({
      id: 77,
      name: 'Derived Song',
      artists: [
        { id: 1, name: 'Artist A' },
        { id: 2, name: 'Artist B' }
      ],
      album: {
        id: 9,
        name: 'Album 9',
        picUrl: 'cover-9.jpg'
      }
    })

    const viewModel = createEventViewModel(
      {
        eventId: 7,
        eventTime: now.getTime() - 2 * 60 * 60 * 1000,
        message: 'derived metadata',
        user: {
          nickname: 'tester',
          avatarUrl: 'avatar-7.jpg'
        },
        song: null,
        playableSong
      },
      0,
      now
    )

    expect(viewModel).toMatchObject({
      key: '7',
      message: 'derived metadata',
      formattedTime: '2小时前',
      userName: 'tester',
      userAvatarUrl: 'avatar-7.jpg',
      userAvatarAlt: 'tester',
      songName: 'Derived Song',
      songCoverUrl: 'cover-9.jpg',
      artistText: 'Artist A / Artist B',
      playableSong
    })
    expect(viewModel.displaySong).toBe(playableSong)
  })

  it('reuses cached event view models for unchanged events when new pages append', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const cache = new Map<string, EventViewModelCacheEntry>()
    const firstEvent = {
      eventId: 1,
      eventTime: now.getTime(),
      message: 'first'
    }
    const secondEvent = {
      eventId: 2,
      eventTime: now.getTime() - 1000,
      message: 'second'
    }

    const initialViewModels = buildCachedEventViewModels([firstEvent], cache, now)
    const nextViewModels = buildCachedEventViewModels([firstEvent, secondEvent], cache, now)

    expect(nextViewModels[0]).toBe(initialViewModels[0])
    expect(nextViewModels[1]).not.toBeUndefined()
    expect(nextViewModels[1]?.key).toBe('2')
  })

  it('stops requesting more when a page adds no unique events and lasttime does not advance', async () => {
    getUserEventMock
      .mockResolvedValueOnce({
        events: [{ eventId: 1, json: JSON.stringify({ msg: 'page 1 event 1' }) }],
        more: true,
        lasttime: 111
      })
      .mockResolvedValueOnce({
        events: [{ eventId: 1, json: JSON.stringify({ msg: 'page 1 event 1' }) }],
        more: true,
        lasttime: 111
      })

    const viewModel = mountUseUserEvents()

    await viewModel.loadEvents(42, 1)
    await flushPromises()
    await viewModel.loadMoreEvents()
    await flushPromises()

    expect(viewModel.events.value).toHaveLength(1)
    expect(viewModel.hasMore.value).toBe(false)
  })

  it('returns an empty formatted time when the event timestamp is invalid', () => {
    expect(formatEventTimeLabel(undefined)).toBe('')
    expect(formatEventTimeLabel('not-a-date')).toBe('')
  })

  it('loads more events incrementally and ignores duplicate load-more requests', async () => {
    const secondPageDeferred = createDeferred<{
      events: Array<{ eventId: number; json: string }>
      more: boolean
      lasttime: number
    }>()

    getUserEventMock
      .mockResolvedValueOnce({
        events: [
          { eventId: 1, json: JSON.stringify({ msg: 'page 1 event 1' }) },
          { eventId: 2, json: JSON.stringify({ msg: 'page 1 event 2' }) }
        ],
        more: true,
        lasttime: 111
      })
      .mockImplementationOnce(() => secondPageDeferred.promise)

    const viewModel = mountUseUserEvents()

    await viewModel.loadEvents(42, 2)
    await flushPromises()

    expect(viewModel.events.value).toHaveLength(2)
    expect(viewModel.hasMore.value).toBe(true)
    expect(getUserEventMock).toHaveBeenNthCalledWith(1, 42, 2, -1)

    const firstLoadMore = viewModel.loadMoreEvents()
    const secondLoadMore = viewModel.loadMoreEvents()
    await flushPromises()

    expect(getUserEventMock).toHaveBeenNthCalledWith(2, 42, 2, 111)
    expect(getUserEventMock).toHaveBeenCalledTimes(2)
    expect(viewModel.loadingMore.value).toBe(true)

    secondPageDeferred.resolve({
      events: [{ eventId: 3, json: JSON.stringify({ msg: 'page 2 event 1' }) }],
      more: false,
      lasttime: 222
    })

    await firstLoadMore
    await secondLoadMore
    await flushPromises()

    expect(viewModel.events.value.map(event => event.eventId)).toEqual([1, 2, 3])
    expect(viewModel.hasMore.value).toBe(false)
    expect(viewModel.loadingMore.value).toBe(false)
  })

  it('retries the failed request and preserves the requested page state', async () => {
    getUserEventMock.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce({
      events: [{ eventId: 9, json: JSON.stringify({ msg: 'recovered' }) }],
      more: false,
      lasttime: 333
    })

    const viewModel = mountUseUserEvents()

    await viewModel.loadEvents(7, 5)
    await flushPromises()

    expect(viewModel.error.value).toBeInstanceOf(Error)
    expect(viewModel.events.value).toEqual([])

    await viewModel.retryLoadEvents()
    await flushPromises()

    expect(getUserEventMock).toHaveBeenNthCalledWith(1, 7, 5, -1)
    expect(getUserEventMock).toHaveBeenNthCalledWith(2, 7, 5, -1)
    expect(viewModel.error.value).toBe(null)
    expect(viewModel.events.value).toHaveLength(1)
    expect(viewModel.events.value[0]?.message).toBe('recovered')
  })
})
