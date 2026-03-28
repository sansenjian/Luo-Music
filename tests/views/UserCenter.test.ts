import { computed, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue', async importOriginal => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    defineAsyncComponent: () => ({
      template: '<div />'
    })
  }
})

const pushMock = vi.hoisted(() => vi.fn())
const loadLikedSongsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const resetLikedSongsMock = vi.hoisted(() => vi.fn())
const loadPlaylistsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const loadPlaylistSongsMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])))
const resetPlaylistsMock = vi.hoisted(() => vi.fn())
const loadEventsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const resetEventsMock = vi.hoisted(() => vi.fn())

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

type UserStoreState = {
  isLoggedIn: boolean
  userId: string | null
  avatarUrl: string
  nickname: string
}

const userStoreState = reactive<UserStoreState>({
  isLoggedIn: true,
  userId: 'user-1',
  avatarUrl: '',
  nickname: 'tester'
})

const playlistStoreMock = {
  setPlaylist: vi.fn()
}

const playerStoreMock = {
  setSongList: vi.fn(),
  playSongWithDetails: vi.fn(() => Promise.resolve())
}

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}))

vi.mock('../../src/store/userStore', () => ({
  useUserStore: () => userStoreState
}))

vi.mock('../../src/store/playlistStore', () => ({
  usePlaylistStore: () => playlistStoreMock
}))

vi.mock('../../src/store/playerStore.ts', () => ({
  usePlayerStore: () => playerStoreMock
}))

vi.mock('../../src/composables/useUserDataQuery', () => ({
  useUserDataQuery: vi.fn()
}))

vi.mock('../../src/composables/useLikedSongs', () => ({
  useLikedSongs: () => ({
    likeSongs: ref([]),
    formattedSongs: computed(() => []),
    count: computed(() => 0),
    loading: ref(false),
    error: ref(null),
    resetLikedSongs: resetLikedSongsMock,
    loadLikedSongs: loadLikedSongsMock
  })
}))

vi.mock('../../src/composables/useUserPlaylists', () => ({
  useUserPlaylists: () => ({
    playlists: ref([]),
    count: computed(() => 0),
    loading: ref(false),
    error: ref(null),
    resetPlaylists: resetPlaylistsMock,
    loadPlaylists: loadPlaylistsMock,
    loadPlaylistSongs: loadPlaylistSongsMock
  })
}))

vi.mock('../../src/composables/useUserEvents', () => ({
  useUserEvents: () => ({
    events: ref([]),
    count: computed(() => 0),
    loading: ref(false),
    error: ref(null),
    formatEventTime: vi.fn(() => ''),
    getEventMsg: vi.fn(() => ''),
    resetEvents: resetEventsMock,
    loadEvents: loadEventsMock
  })
}))

describe('UserCenter', () => {
  beforeEach(() => {
    userStoreState.isLoggedIn = true
    userStoreState.userId = 'user-1'
    userStoreState.avatarUrl = ''
    userStoreState.nickname = 'tester'

    vi.clearAllMocks()
  })

  it('reloads user scoped data when the account changes on the same route', async () => {
    const UserCenter = (await import('../../src/views/UserCenter.vue')).default
    mount(UserCenter, {
      global: {
        stubs: {
          UserProfileHeader: true,
          LikedSongsView: true,
          PlaylistsView: true,
          EventsView: true
        }
      }
    })

    await flushPromises()

    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).toHaveBeenCalledWith('user-1')
    expect(loadPlaylistsMock).toHaveBeenCalledWith('user-1')
    expect(loadEventsMock).toHaveBeenCalledWith('user-1')

    vi.clearAllMocks()

    userStoreState.userId = 'user-2'
    await nextTick()
    await flushPromises()

    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).toHaveBeenCalledWith('user-2')
    expect(loadPlaylistsMock).toHaveBeenCalledWith('user-2')
    expect(loadEventsMock).toHaveBeenCalledWith('user-2')
  })

  it('clears stale user data and redirects when logout happens on the user route', async () => {
    const UserCenter = (await import('../../src/views/UserCenter.vue')).default
    mount(UserCenter, {
      global: {
        stubs: {
          UserProfileHeader: true,
          LikedSongsView: true,
          PlaylistsView: true,
          EventsView: true
        }
      }
    })

    await flushPromises()
    vi.clearAllMocks()

    userStoreState.isLoggedIn = false
    userStoreState.userId = null
    await nextTick()
    await flushPromises()

    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).not.toHaveBeenCalled()
    expect(loadPlaylistsMock).not.toHaveBeenCalled()
    expect(loadEventsMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('keeps the active tab component mounted while its data is still loading', async () => {
    const likedDeferred = createDeferred<void>()
    loadLikedSongsMock.mockImplementationOnce(() => likedDeferred.promise)
    loadPlaylistsMock.mockImplementationOnce(() => Promise.resolve())
    loadEventsMock.mockImplementationOnce(() => Promise.resolve())

    const likedLifecycle = {
      mounted: vi.fn(),
      unmounted: vi.fn()
    }

    const UserCenter = (await import('../../src/views/UserCenter.vue')).default
    mount(UserCenter, {
      global: {
        stubs: {
          UserProfileHeader: true,
          LikedSongsView: {
            props: ['loading'],
            mounted() {
              likedLifecycle.mounted()
            },
            unmounted() {
              likedLifecycle.unmounted()
            },
            template: '<div class="liked-view-stub">{{ loading ? "loading" : "ready" }}</div>'
          },
          PlaylistsView: true,
          EventsView: true
        }
      }
    })

    await nextTick()

    expect(likedLifecycle.mounted).toHaveBeenCalledTimes(1)
    expect(likedLifecycle.unmounted).not.toHaveBeenCalled()

    likedDeferred.resolve()
    await flushPromises()
  })
})
