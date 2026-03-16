import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeWorkspace from '../../../src/components/home/HomeWorkspace.vue'

function createWrapper(activeTab: 'lyric' | 'playlist') {
  return mount(HomeWorkspace, {
    props: {
      activeTab
    },
    slots: {
      lyric: '<div class="lyric-content">Lyric Slot</div>',
      playlist: '<div class="playlist-content">Playlist Slot</div>'
    }
  })
}

describe('HomeWorkspace', () => {
  it('shows lyric slot and hides playlist slot when activeTab is lyric', () => {
    const wrapper = createWrapper('lyric')

    const lyricView = wrapper.find('.lyric-view')
    const playlistView = wrapper.find('.playlist-view')

    expect(lyricView.isVisible()).toBe(true)
    expect(playlistView.isVisible()).toBe(false)
  })

  it('shows playlist slot and hides lyric slot when activeTab is playlist', () => {
    const wrapper = createWrapper('playlist')

    const lyricView = wrapper.find('.lyric-view')
    const playlistView = wrapper.find('.playlist-view')

    expect(lyricView.isVisible()).toBe(false)
    expect(playlistView.isVisible()).toBe(true)
  })

  it('re-emits change-tab from HomeTabBar', async () => {
    const wrapper = createWrapper('lyric')

    const tabButtons = wrapper.findAll('.tab')
    await tabButtons[1].trigger('click')

    expect(wrapper.emitted('change-tab')?.[0]).toEqual(['playlist'])
  })
})
