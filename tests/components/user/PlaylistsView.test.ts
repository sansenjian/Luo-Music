import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PlaylistsView from '@/components/user/PlaylistsView.vue'

describe('PlaylistsView', () => {
  it('keeps the playlist grid visible when cached data exists during loading', () => {
    const wrapper = mount(PlaylistsView, {
      props: {
        loading: true,
        playlists: [
          {
            id: 'playlist-1',
            name: 'Playlist 1',
            coverImgUrl: 'cover.jpg',
            trackCount: 12
          }
        ]
      }
    })

    expect(wrapper.find('.loading-container').exists()).toBe(false)
    expect(wrapper.find('.playlists-grid').exists()).toBe(true)
    expect(wrapper.get('.playlist-cover img').attributes('loading')).toBe('lazy')
    expect(wrapper.get('.playlist-cover img').attributes('decoding')).toBe('async')
  })

  it('shows a local playing state on the matching playlist button', () => {
    const wrapper = mount(PlaylistsView, {
      props: {
        playingPlaylistId: 'playlist-1',
        playlists: [
          {
            id: 'playlist-1',
            name: 'Playlist 1',
            coverImgUrl: 'cover.jpg',
            trackCount: 12
          }
        ]
      }
    })

    const playButton = wrapper.get('.playlist-play-button')

    expect(playButton.text()).toContain('播放中...')
    expect(playButton.attributes('disabled')).toBeDefined()
  })
})
