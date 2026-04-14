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
})
