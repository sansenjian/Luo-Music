import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HomeMediaSongsSection from '@/features/home/components/media/HomeMediaSongsSection.vue'
import { createMockSong } from '../../../utils/test-utils'

function mountSongsSection(props: Record<string, unknown> = {}) {
  return mount(HomeMediaSongsSection, {
    props: {
      songs: [],
      loading: false,
      emptyDescription: '暂无歌曲。',
      ...props
    },
    global: {
      stubs: {
        SongDetailList: defineComponent({
          name: 'SongDetailList',
          props: {
            songs: {
              type: Array,
              required: true
            },
            activeSongId: {
              type: [String, Number],
              required: false,
              default: null
            },
            infiniteScroll: {
              type: Boolean,
              required: false,
              default: false
            }
          },
          emits: ['play-song', 'song-context-menu', 'load-more'],
          template: `
            <div
              class="song-detail-list-stub"
              :data-song-count="songs.length"
              :data-active-song-id="activeSongId"
              :data-infinite-scroll="String(infiniteScroll)"
            >
              <button class="play-song-trigger" @click="$emit('play-song', 1)">play</button>
              <button class="song-context-menu-trigger" @click="$emit('song-context-menu', { index: 0, song: songs[0], clientX: 24, clientY: 40 })">menu</button>
              <button class="load-more-trigger" @click="$emit('load-more')">more</button>
            </div>
          `
        })
      }
    }
  })
}

describe('HomeMediaSongsSection', () => {
  it('renders a loading card when songs are loading for the first time', () => {
    const wrapper = mountSongsSection({
      loading: true,
      loadingDescription: '正在载入我的喜欢歌曲。'
    })

    expect(wrapper.text()).toContain('正在载入我的喜欢歌曲。')
    expect(wrapper.find('.song-detail-list-stub').exists()).toBe(false)
  })

  it('renders an error card and emits retry when the empty state fails', async () => {
    const wrapper = mountSongsSection({
      errorMessage: '加载失败，请重试。',
      showErrorState: true
    })

    expect(wrapper.text()).toContain('加载失败，请重试。')

    await wrapper.get('.media-state-action').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('renders the empty state copy when no songs match', () => {
    const wrapper = mountSongsSection({
      emptyDescription: '没有找到匹配的歌曲。'
    })

    expect(wrapper.text()).toContain('没有找到匹配的歌曲。')
  })

  it('renders the shared table shell and re-emits song events', async () => {
    const wrapper = mountSongsSection({
      songs: [
        createMockSong({
          id: 'song-1',
          name: 'Song 1'
        })
      ],
      activeSongId: 'song-1',
      hasMore: true,
      loadingMore: true,
      showLoadingMoreHint: true,
      loadMoreEnabled: true
    })

    expect(wrapper.text()).toContain('标题')
    expect(wrapper.find('.song-detail-list-stub').attributes('data-song-count')).toBe('1')
    expect(wrapper.find('.song-detail-list-stub').attributes('data-active-song-id')).toBe('song-1')
    expect(wrapper.find('.song-detail-list-stub').attributes('data-infinite-scroll')).toBe('true')
    expect(wrapper.text()).toContain('正在加载更多歌曲...')

    await wrapper.get('.play-song-trigger').trigger('click')
    await wrapper.get('.song-context-menu-trigger').trigger('click')
    await wrapper.get('.load-more-trigger').trigger('click')

    expect(wrapper.emitted('play-song')).toEqual([[1]])
    expect(wrapper.emitted('song-context-menu')?.[0]?.[0]).toMatchObject({
      clientX: 24,
      clientY: 40,
      index: 0
    })
    expect(wrapper.emitted('load-more')).toHaveLength(1)
  })
})
