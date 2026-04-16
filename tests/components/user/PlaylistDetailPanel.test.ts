import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PlaylistDetailPanel from '@/components/user/PlaylistDetailPanel.vue'
import { createMockSong } from '../../utils/test-utils'

describe('PlaylistDetailPanel', () => {
  it('does not render stale song rows while the next playlist detail is loading', () => {
    const wrapper = mount(PlaylistDetailPanel, {
      props: {
        playlist: {
          id: 'playlist-1',
          name: 'Playlist 1',
          trackCount: 10
        },
        songs: [createMockSong({ id: 'song-1', name: 'Stale Song' })],
        loading: true
      }
    })

    expect(wrapper.text()).toContain('歌单详情加载中...')
    expect(wrapper.find('.detail-song').exists()).toBe(false)
  })

  it('does not render stale song rows when detail loading fails', () => {
    const wrapper = mount(PlaylistDetailPanel, {
      props: {
        playlist: {
          id: 'playlist-1',
          name: 'Playlist 1',
          trackCount: 10
        },
        songs: [createMockSong({ id: 'song-1', name: 'Stale Song' })],
        error: new Error('load failed')
      }
    })

    expect(wrapper.text()).toContain('歌单详情加载失败')
    expect(wrapper.find('.detail-song').exists()).toBe(false)
  })
})
