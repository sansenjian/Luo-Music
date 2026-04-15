import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import EventsView from '@/components/user/EventsView.vue'
import { createMockSong } from '../../utils/test-utils'

describe('EventsView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders pre-parsed event messages from the view model', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 1,
            eventTime: Date.now(),
            message: 'test event message',
            user: {
              nickname: 'tester',
              avatarUrl: ''
            },
            song: null
          }
        ]
      }
    })

    expect(wrapper.text()).toContain('test event message')
  })

  it('renders the list without requiring raw event json parsing in the component', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 2,
            eventTime: Date.now(),
            user: {
              nickname: 'tester',
              avatarUrl: ''
            },
            song: null
          }
        ]
      }
    })

    expect(wrapper.find('.event-item').exists()).toBe(true)
    expect(wrapper.find('.event-content').exists()).toBe(false)
  })

  it('renders precomputed song metadata and lazy-loads event images', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'))

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

    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 7,
            eventTime: Date.now() - 2 * 60 * 60 * 1000,
            message: 'derived metadata',
            user: {
              nickname: 'tester',
              avatarUrl: 'avatar-7.jpg'
            },
            song: null,
            playableSong
          }
        ]
      }
    })

    expect(wrapper.find('.event-time').text()).toBe('2小时前')
    expect(wrapper.find('.event-song-name').text()).toBe('Derived Song')
    expect(wrapper.find('.event-song-artist').text()).toBe('Artist A / Artist B')
    expect(wrapper.find('.event-user-avatar').attributes('loading')).toBe('lazy')
    expect(wrapper.find('.event-song-cover').attributes('decoding')).toBe('async')
  })

  it('emits filter, retry, load-more, and play-song actions', async () => {
    const playableSong = createMockSong({
      id: 88,
      name: 'Playable Event Song'
    })

    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        loadingMore: false,
        hasMore: true,
        error: new Error('load failed'),
        activeFilter: 'all',
        events: [
          {
            eventId: 3,
            eventTime: Date.now(),
            message: 'event with playable song',
            user: {
              nickname: 'tester',
              avatarUrl: ''
            },
            song: {
              id: playableSong.id,
              name: playableSong.name,
              artists: playableSong.artists,
              album: playableSong.album
            },
            playableSong
          }
        ]
      }
    })

    const filterChips = wrapper.findAll('.filter-chip')
    expect(filterChips.length).toBeGreaterThan(1)
    await filterChips[1]!.trigger('click')
    await wrapper.find('.inline-action').trigger('click')
    await wrapper.find('.action-button').trigger('click')
    await wrapper.find('.event-song-play').trigger('click')

    expect(wrapper.emitted('update:filter')).toEqual([['song']])
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('loadMore')).toHaveLength(1)
    expect(wrapper.emitted('play-song')?.[0]?.[0]).toMatchObject({
      id: 88,
      name: 'Playable Event Song'
    })
    expect(wrapper.emitted('play-song')?.[0]?.[1]).toMatchObject({
      eventId: 3
    })
  })

  it('shows a blocking error state and filtered empty copy when needed', async () => {
    const errorWrapper = mount(EventsView, {
      props: {
        loading: false,
        error: new Error('fetch failed'),
        activeFilter: 'all',
        events: []
      }
    })

    expect(errorWrapper.text()).toContain('fetch failed')
    await errorWrapper.find('.action-button').trigger('click')
    expect(errorWrapper.emitted('retry')).toHaveLength(1)

    const emptyWrapper = mount(EventsView, {
      props: {
        loading: false,
        activeFilter: 'song',
        events: []
      }
    })

    expect(emptyWrapper.text()).toContain('暂无音乐动态')
  })
})
