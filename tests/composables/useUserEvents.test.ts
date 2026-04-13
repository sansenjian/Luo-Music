import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUserEvents, type UseUserEventsReturn } from '@/composables/useUserEvents'

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function mountUseUserEvents() {
  let viewModel!: UseUserEventsReturn

  const Harness = defineComponent({
    setup() {
      viewModel = useUserEvents()
      return () => null
    }
  })

  mount(Harness)

  return viewModel
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
