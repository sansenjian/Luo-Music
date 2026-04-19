import { computed, defineComponent, ref, type ComputedRef, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibraryTrack
} from '@/types/localLibrary'
import type { Song } from '@/types/schemas'
import { createLocalLibraryMock } from '../../fixtures/localLibrary'

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
    useLocalLibraryMock.mockReturnValue(createLocalLibraryMock())

    const { default: HomeLocalMusicPanel } =
      await import('@/components/home/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)

    expect(wrapper.text()).toContain('本地音乐仅支持桌面端')
  })

  it('plays the selected local track through the existing player store', async () => {
    const localSong: Song = {
      id: 'local:track-1',
      name: '夜航',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'local',
      originalId: 'local:track-1',
      url: 'luo-media://media?path=D%3A%5CMusic%5C%E5%A4%9C%E8%88%AA.mp3',
      extra: {
        localSource: true
      }
    }

    useLocalLibraryMock.mockReturnValue(
      createLocalLibraryMock({
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
              coverHash: null,
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
        })
      })
    )

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

  it('passes loaded local songs into SongDetailList for rendering', async () => {
    const localSong: Song = {
      id: 'local:track-1',
      name: '夜航',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'local',
      originalId: 'local:track-1',
      url: 'luo-media://media?path=D%3A%5CMusic%5C%E5%A4%9C%E8%88%AA.mp3',
      extra: {
        localSource: true
      }
    }

    useLocalLibraryMock.mockReturnValue(
      createLocalLibraryMock({
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
          tracks: [],
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
        })
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/components/home/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel, {
      global: {
        stubs: {
          SongDetailList: defineComponent({
            name: 'SongDetailListStub',
            props: {
              songs: {
                type: Array,
                required: true
              }
            },
            template: '<div class="song-detail-list-stub">{{ songs.length }}</div>'
          })
        }
      }
    })

    expect(wrapper.get('.song-detail-list-stub').text()).toBe('1')
  })

  it('shows unknown duration marker for local tracks without a known duration', async () => {
    const localSong = {
      id: 'local:track-ogg',
      name: 'Unknown OGG',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'local' as const,
      originalId: 'local:track-ogg',
      url: 'luo-media://media?path=D%3A%5CMusic%5Cunknown.ogg',
      extra: {
        localSource: true,
        localDurationKnown: false
      }
    }

    useLocalLibraryMock.mockReturnValue(
      createLocalLibraryMock({
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
          tracks: [],
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
        songsPage: ref({
          items: [
            {
              id: 'local:track-ogg',
              folderId: 'folder-1',
              filePath: 'D:\\Music\\unknown.ogg',
              fileName: 'unknown.ogg',
              title: 'Unknown OGG',
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
        })
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/components/home/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)

    expect(wrapper.text()).toContain('--:--')
  })
})
