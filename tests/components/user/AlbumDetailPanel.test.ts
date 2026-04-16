import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AlbumDetailPanel from '@/components/user/AlbumDetailPanel.vue'
import { createMockSong } from '../../utils/test-utils'

describe('AlbumDetailPanel', () => {
  it('falls back to the selected album cover when track covers are missing', () => {
    const wrapper = mount(AlbumDetailPanel, {
      props: {
        album: {
          id: 'album-1',
          name: 'Album 1',
          picUrl: 'album-cover.jpg',
          size: 1,
          artistName: 'Artist 1'
        },
        songs: [
          createMockSong({
            id: 'song-1',
            name: 'Song 1',
            album: {
              id: 'album-1',
              name: 'Album 1',
              picUrl: ''
            }
          })
        ]
      }
    })

    const cover = wrapper.get('img.detail-song-cover')
    expect(cover.attributes('src')).toBe('album-cover.jpg')
  })

  it('does not render stale song rows while the next album detail is loading', () => {
    const wrapper = mount(AlbumDetailPanel, {
      props: {
        album: {
          id: 'album-1',
          name: 'Album 1',
          picUrl: 'album-cover.jpg',
          size: 1,
          artistName: 'Artist 1'
        },
        songs: [createMockSong({ id: 'song-1', name: 'Stale Song' })],
        loading: true
      }
    })

    expect(wrapper.text()).toContain('专辑详情加载中...')
    expect(wrapper.find('.detail-song').exists()).toBe(false)
  })

  it('does not render stale song rows when detail loading fails', () => {
    const wrapper = mount(AlbumDetailPanel, {
      props: {
        album: {
          id: 'album-1',
          name: 'Album 1',
          picUrl: 'album-cover.jpg',
          size: 1,
          artistName: 'Artist 1'
        },
        songs: [createMockSong({ id: 'song-1', name: 'Stale Song' })],
        error: new Error('load failed')
      }
    })

    expect(wrapper.text()).toContain('专辑详情加载失败')
    expect(wrapper.find('.detail-song').exists()).toBe(false)
  })
})
