import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, beforeEach, vi } from 'vitest'

const getUserPlaylistMock = vi.hoisted(() => vi.fn())
const getPlaylistDetailMock = vi.hoisted(() => vi.fn())
const getPlaylistTracksMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())
const getAlbumDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/playlist', () => ({
  getUserPlaylist: getUserPlaylistMock,
  getPlaylistDetail: getPlaylistDetailMock,
  getPlaylistTracks: getPlaylistTracksMock
}))

vi.mock('@/api/album', () => ({
  getAlbumSublist: getAlbumSublistMock,
  getAlbumDetail: getAlbumDetailMock
}))

import HomeSidebar from '@/components/home/HomeSidebar.vue'
import { useUserStore } from '@/store/userStore'

describe('HomeSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserPlaylistMock.mockResolvedValue({
      playlist: [
        {
          id: 'created-1',
          name: '我的测试歌单',
          trackCount: 29,
          coverImgUrl: 'https://example.com/created-cover.png',
          subscribed: false
        },
        {
          id: 'favorite-1',
          name: '收藏歌单A',
          trackCount: 18,
          coverImgUrl: 'https://example.com/favorite-cover.png',
          subscribed: true
        }
      ]
    })
    getAlbumSublistMock.mockResolvedValue({
      data: [
        {
          id: 'album-1',
          name: '收藏专辑A',
          picUrl: 'https://example.com/album-cover.png',
          size: 12,
          artist: {
            name: 'Album Artist'
          }
        }
      ],
      count: 1,
      hasMore: false
    })
  })

  it('renders the new sidebar sections, playlist tabs, and login info footer', () => {
    const wrapper = mount(HomeSidebar)

    expect(wrapper.text()).toContain('LUO Music')
    expect(wrapper.text()).toContain('探索')
    expect(wrapper.text()).toContain('资料库')
    expect(wrapper.text()).toContain('歌单')
    expect(wrapper.text()).toContain('我的歌单')
    expect(wrapper.text()).toContain('收藏歌单')
    expect(wrapper.text()).toContain('登录信息')
    expect(wrapper.text()).toContain('网易云')
    expect(wrapper.text()).toContain('QQ音乐')
    expect(wrapper.text()).toContain('未登录')
    expect(wrapper.text()).toContain('登录后查看歌单')
    expect(wrapper.find('.sidebar-user-avatar-image').exists()).toBe(false)
    expect(wrapper.find('.sidebar-footer').exists()).toBe(true)
  })

  it('switches the active item when a sidebar link is clicked', async () => {
    const wrapper = mount(HomeSidebar)
    const links = wrapper.findAll('.sidebar-link')

    expect(links[0].classes()).toContain('active')

    const localMusicLink = links.find(link => link.text().includes('本地音乐'))
    expect(localMusicLink).toBeDefined()

    await localMusicLink?.trigger('click')

    expect(localMusicLink?.classes()).toContain('active')
    expect(links[0].classes()).not.toContain('active')
    expect(wrapper.emitted('item-select')?.[0]).toEqual(['local'])
  })

  it('respects a controlled active item from the parent workspace state', () => {
    const wrapper = mount(HomeSidebar, {
      props: {
        activeItemId: 'liked'
      }
    })

    const likedLink = wrapper
      .findAll('.sidebar-link')
      .find(link => link.text().includes('我喜欢的音乐'))
    const homeLink = wrapper.findAll('.sidebar-link').find(link => link.text().includes('主页'))

    expect(likedLink?.classes()).toContain('active')
    expect(homeLink?.classes()).not.toContain('active')
  })

  it('hides the sidebar brand block when showBrand is false', () => {
    const wrapper = mount(HomeSidebar, {
      props: {
        showBrand: false
      }
    })

    expect(wrapper.text()).not.toContain('LUO Music')
    expect(wrapper.find('.sidebar-brand').exists()).toBe(false)
  })

  it('shows only icons when collapsed is true', () => {
    const wrapper = mount(HomeSidebar, {
      props: {
        collapsed: true
      }
    })

    expect(wrapper.classes()).toContain('is-collapsed')
    expect(wrapper.text()).not.toContain('主页')
    expect(wrapper.text()).not.toContain('LUO Music')
    expect(wrapper.find('.sidebar-icon').exists()).toBe(true)
    expect(wrapper.find('.playlist-cover').exists()).toBe(false)
  })

  it('loads and displays my playlists from the same source as user center', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mount(HomeSidebar)
    await flushPromises()

    expect(getUserPlaylistMock).toHaveBeenCalledWith(1001)
    expect(wrapper.text()).toContain('我的测试歌单')
    expect(wrapper.text()).toContain('29 首歌')
    expect(wrapper.text()).not.toContain('收藏歌单A')

    const playlistImage = wrapper.get('.playlist-cover-image')
    expect(playlistImage.attributes('src')).toBe('https://example.com/created-cover.png')
  })

  it('switches playlist group labels using synced favorite collections', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mount(HomeSidebar)
    await flushPromises()

    const filterButtons = wrapper.findAll('.playlist-filter')
    await filterButtons[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('收藏歌单A')
    expect(wrapper.text()).toContain('收藏专辑A')
    expect(wrapper.text()).toContain('18 首歌')
    expect(wrapper.text()).toContain('Album Artist')
    expect(wrapper.text()).toContain('12 首歌')
    expect(wrapper.text()).not.toContain('我的测试歌单')
  })

  it('emits collection-select when a sidebar collection card is clicked', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mount(HomeSidebar)
    await flushPromises()

    const collectionCard = wrapper.find('.playlist-card')
    await collectionCard.trigger('click')

    expect(wrapper.emitted('item-select')?.at(-1)).toEqual(['playlist:created-1'])
    expect(wrapper.emitted('collection-select')?.[0]).toEqual([
      {
        uiId: 'playlist:created-1',
        sourceId: 'created-1',
        kind: 'playlist',
        name: '我的测试歌单',
        coverUrl: 'https://example.com/created-cover.png',
        summary: '29 首歌'
      }
    ])
  })

  it('reflects netease and qq login state from userStore as display-only text', () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png'
      },
      'netease-cookie'
    )
    userStore.setQQCookie('qq-cookie')

    const wrapper = mount(HomeSidebar)
    const avatarImage = wrapper.get('.sidebar-user-avatar-image')

    expect(wrapper.text()).toContain('Tester')
    expect(wrapper.text()).toContain('网易云')
    expect(wrapper.text()).toContain('QQ音乐')
    expect(wrapper.text()).toContain('已登录')
    expect(wrapper.text()).not.toContain('未登录')
    expect(avatarImage.attributes('src')).toBe('https://example.com/avatar.png')
  })
})
