import { computed, defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useLocalLibraryMock = vi.hoisted(() => vi.fn())
const playerStoreMock = vi.hoisted(() => ({
  currentSong: null as { id: string | number } | null,
  setSongList: vi.fn(),
  playSongWithDetails: vi.fn()
}))
const toastStoreMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('@/composables/useLocalLibrary', () => ({
  useLocalLibrary: useLocalLibraryMock
}))

vi.mock('@/store/playerStore', () => ({
  usePlayerStore: () => playerStoreMock
}))

vi.mock('@/store/toastStore', () => ({
  useToastStore: () => toastStoreMock
}))

describe('HomeLocalMusicPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the unsupported state outside Electron', async () => {
    useLocalLibraryMock.mockReturnValue({
      state: ref({
        supported: false,
        folders: [],
        tracks: [],
        status: {
          phase: 'idle',
          scannedFolders: 0,
          scannedFiles: 0,
          discoveredTracks: 0,
          currentFolder: null,
          startedAt: null,
          finishedAt: null,
          message: '本地音乐仅支持 Electron 桌面端'
        }
      }),
      status: computed(() => ({
        phase: 'idle',
        scannedFolders: 0,
        scannedFiles: 0,
        discoveredTracks: 0,
        currentFolder: null,
        startedAt: null,
        finishedAt: null,
        message: '本地音乐仅支持 Electron 桌面端'
      })),
      loading: ref(false),
      pageLoading: ref(false),
      mutating: ref(false),
      songsPage: ref({
        items: [],
        nextCursor: null,
        total: 0,
        limit: 60
      }),
      artistsPage: ref({
        items: [],
        nextCursor: null,
        total: 0,
        limit: 60
      }),
      albumsPage: ref({
        items: [],
        nextCursor: null,
        total: 0,
        limit: 60
      }),
      coverUrls: ref({}),
      refresh: vi.fn(),
      addFolder: vi.fn(),
      removeFolder: vi.fn(),
      setFolderEnabled: vi.fn(),
      rescan: vi.fn(),
      loadTracks: vi.fn(),
      loadArtists: vi.fn(),
      loadAlbums: vi.fn()
    })

    const { default: HomeLocalMusicPanel } =
      await import('@/components/home/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)

    expect(wrapper.text()).toContain('本地音乐仅支持桌面端')
  })

  it('plays the selected local track through the existing player store', async () => {
    const localSong = {
      id: 'local:track-1',
      name: '夜航',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'netease' as const,
      originalId: 'local:track-1',
      url: 'luo-media://media?path=D%3A%5CMusic%5C%E5%A4%9C%E8%88%AA.mp3',
      extra: {
        localSource: true
      }
    }

    useLocalLibraryMock.mockReturnValue({
      state: ref({
        supported: true,
        folders: [
          {
            id: 'folder-1',
            path: 'D:\\Music',
            name: 'Music',
            enabled: true,
            createdAt: Date.now(),
            lastScannedAt: Date.now(),
            songCount: 1
          }
        ],
        tracks: [
          {
            id: 'local:track-1',
            folderId: 'folder-1',
            filePath: 'D:\\Music\\夜航.mp3',
            fileName: '夜航.mp3',
            title: '夜航',
            artist: '本地歌手',
            album: '本地专辑',
            duration: 0,
            fileSize: 1024,
            modifiedAt: Date.now(),
            song: localSong
          }
        ],
        status: {
          phase: 'idle',
          scannedFolders: 1,
          scannedFiles: 1,
          discoveredTracks: 1,
          currentFolder: null,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          message: '已收录 1 首本地歌曲'
        }
      }),
      status: computed(() => ({
        phase: 'idle',
        scannedFolders: 1,
        scannedFiles: 1,
        discoveredTracks: 1,
        currentFolder: null,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        message: '已收录 1 首本地歌曲'
      })),
      loading: ref(false),
      pageLoading: ref(false),
      mutating: ref(false),
      songsPage: ref({
        items: [
          {
            id: 'local:track-1',
            folderId: 'folder-1',
            filePath: 'D:\\Music\\夜航.mp3',
            fileName: '夜航.mp3',
            title: '夜航',
            artist: '本地歌手',
            album: '本地专辑',
            duration: 0,
            fileSize: 1024,
            modifiedAt: Date.now(),
            coverHash: null,
            song: localSong
          }
        ],
        nextCursor: null,
        total: 1,
        limit: 60
      }),
      artistsPage: ref({
        items: [],
        nextCursor: null,
        total: 0,
        limit: 60
      }),
      albumsPage: ref({
        items: [],
        nextCursor: null,
        total: 0,
        limit: 60
      }),
      coverUrls: ref({}),
      refresh: vi.fn(),
      addFolder: vi.fn(),
      removeFolder: vi.fn(),
      setFolderEnabled: vi.fn(),
      rescan: vi.fn(),
      loadTracks: vi.fn(),
      loadArtists: vi.fn(),
      loadAlbums: vi.fn()
    })

    const { default: HomeLocalMusicPanel } =
      await import('@/components/home/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel, {
      global: {
        stubs: {
          SongDetailList: defineComponent({
            name: 'SongDetailListStub',
            emits: ['play-song'],
            template:
              '<div class="song-detail-list-stub"><button class="play-local-song" @click="$emit(\'play-song\', 0)">play</button></div>'
          })
        }
      }
    })

    await wrapper.get('.play-local-song').trigger('click')

    expect(playerStoreMock.setSongList).toHaveBeenCalledWith([localSong])
    expect(playerStoreMock.playSongWithDetails).toHaveBeenCalledWith(0)
  })
})
