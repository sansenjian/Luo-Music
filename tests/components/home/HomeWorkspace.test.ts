import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

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
  it('shows lyric slot and does not mount playlist slot when activeTab is lyric', () => {
    const wrapper = createWrapper('lyric')

    const lyricView = wrapper.find('.lyric-view')
    const playlistView = wrapper.find('.playlist-view')

    expect(lyricView.exists()).toBe(true)
    expect(lyricView.isVisible()).toBe(true)
    expect(playlistView.exists()).toBe(false)
  })

  it('shows playlist slot and does not mount lyric slot when activeTab is playlist', () => {
    const wrapper = createWrapper('playlist')

    const lyricView = wrapper.find('.lyric-view')
    const playlistView = wrapper.find('.playlist-view')

    expect(lyricView.exists()).toBe(false)
    expect(playlistView.exists()).toBe(true)
    expect(playlistView.isVisible()).toBe(true)
  })

  it('keeps visited panels mounted and toggles visibility after tab switch', async () => {
    const wrapper = createWrapper('lyric')

    await wrapper.setProps({ activeTab: 'playlist' })
    await nextTick()

    const lyricView = wrapper.find('.lyric-view')
    const playlistView = wrapper.find('.playlist-view')

    expect(lyricView.exists()).toBe(true)
    expect(playlistView.exists()).toBe(true)
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
