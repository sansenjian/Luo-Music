import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FavoriteAlbumsView from '@/components/user/FavoriteAlbumsView.vue'

describe('FavoriteAlbumsView', () => {
  it('keeps the album grid visible when cached data exists during loading', () => {
    const wrapper = mount(FavoriteAlbumsView, {
      props: {
        loading: true,
        albums: [
          {
            id: 'album-1',
            name: 'Album 1',
            picUrl: 'album-cover.jpg',
            size: 10,
            artistName: 'Artist 1'
          }
        ]
      }
    })

    expect(wrapper.find('.loading-container').exists()).toBe(false)
    expect(wrapper.find('.albums-grid').exists()).toBe(true)
    expect(wrapper.get('.album-cover img').attributes('loading')).toBe('lazy')
    expect(wrapper.get('.album-cover img').attributes('decoding')).toBe('async')
  })

  it('shows a local playing state on the matching album button', () => {
    const wrapper = mount(FavoriteAlbumsView, {
      props: {
        playingAlbumId: 'album-1',
        albums: [
          {
            id: 'album-1',
            name: 'Album 1',
            picUrl: 'album-cover.jpg',
            size: 10,
            artistName: 'Artist 1'
          }
        ]
      }
    })

    const playButton = wrapper.get('.album-play-button')

    expect(playButton.text()).toContain('播放中...')
    expect(playButton.attributes('disabled')).toBeDefined()
  })
})
