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
} from '@shared/types/localLibrary'
import type { Song } from '@shared/types/schemas'
import { useLocalPlaylistStore } from '@/store/localPlaylistStore'
import { createLocalLibraryMock } from '../../fixtures/localLibrary'

const useLocalLibraryMock = vi.hoisted(() => vi.fn())
const playerStoreMock = vi.hoisted(() => ({
  currentSong: null as { id: string | number } | null,
  setSongList: vi.fn(),
  playSongWithDetails: vi.fn(),
  replaceQueueAndPlay: vi.fn((songs: Song[], index: number) => {
    playerStoreMock.setSongList(songs)
    return playerStoreMock.playSongWithDetails(index)
  })
}))
const toastStoreMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}))
const audioOutputStatusMock = vi.hoisted(() => ({
  value: {
    activeMode: 'exclusive' as const,
    backend: 'native' as const,
    backendAvailable: true,
    devices: [],
    enabled: true,
    nativePlaybackDiagnostics: {
      activeMode: 'exclusive' as const,
      bitPerfectStatus: 'notCandidate' as const,
      outputSampleRate: 48000,
      requestedMode: 'exclusive' as const,
      sampleRateMismatch: true,
      sourceSampleRate: 44100
    },
    nativePlaybackState: 'playing' as const,
    requestedMode: 'exclusive' as const,
    settings: {
      bitPerfectRequired: true,
      bufferFrames: 960,
      deviceId: '',
      diagnosticsEnabled: true,
      fallbackToShared: false,
      mode: 'exclusive' as const,
      sharedDeviceId: '',
      voicemeeterBus: 'A1' as const,
      voicemeeterHardwareOutBus: 'A1' as const,
      voicemeeterHardwareOutDevice: '',
      voicemeeterHardwareOutDriver: 'wdm' as const
    }
  }
}))

vi.mock('@/composables/useLocalLibrary', () => ({
  useLocalLibrary: useLocalLibraryMock
}))

vi.mock('@/composables/useAudioOutputPlugin', async () => {
  const { computed } = await import('vue')

  return {
    useAudioOutputPlugin: () => ({
      audioOutputStatus: computed(() => audioOutputStatusMock.value)
    })
  }
})

vi.mock('@/store/playerStore', () => ({
  usePlayerStore: () => playerStoreMock
}))

vi.mock('@/store/toastStore', () => ({
  useToastStore: () => toastStoreMock
}))

describe('HomeLocalMusicPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    audioOutputStatusMock.value = {
      ...audioOutputStatusMock.value,
      activeMode: 'exclusive',
      backend: 'native',
      enabled: true,
      nativePlaybackDiagnostics: {
        activeMode: 'exclusive',
        bitPerfectStatus: 'notCandidate',
        outputSampleRate: 48000,
        requestedMode: 'exclusive',
        sampleRateMismatch: true,
        sourceSampleRate: 44100
      },
      nativePlaybackState: 'playing',
      requestedMode: 'exclusive'
    }
  })

  it('renders the unsupported state outside Electron', async () => {
    useLocalLibraryMock.mockReturnValue(createLocalLibraryMock())

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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

  it('opens a song context menu and creates a local playlist for the selected track', async () => {
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
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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
            emits: ['song-context-menu'],
            template:
              '<button class="open-local-song-menu" @contextmenu.prevent="$emit(\'song-context-menu\', { index: 0, song: songs[0], clientX: 32, clientY: 48 })">menu</button>'
          })
        }
      }
    })

    await wrapper.get('.open-local-song-menu').trigger('contextmenu')
    expect(wrapper.find('.local-song-context-menu').exists()).toBe(true)

    await wrapper.get('.local-menu-create-playlist').trigger('click')
    expect(wrapper.find('.local-playlist-dialog').exists()).toBe(true)
    expect(wrapper.get<HTMLInputElement>('.local-playlist-name-input').element.value).toBe(
      '夜航歌单'
    )

    await wrapper.get('.local-playlist-name-input').setValue('夜航收藏')
    await wrapper.get('.local-playlist-dialog').trigger('submit')

    const localPlaylistStore = useLocalPlaylistStore()
    expect(localPlaylistStore.playlists).toHaveLength(1)
    expect(localPlaylistStore.playlists[0]?.name).toBe('夜航收藏')
    expect(localPlaylistStore.playlists[0]?.songs[0]?.id).toBe('local:track-1')
    expect(toastStoreMock.success).toHaveBeenCalledWith('已创建本地歌单「夜航收藏」')
    expect(wrapper.find('.local-song-context-menu').exists()).toBe(false)
    expect(wrapper.find('.local-playlist-dialog').exists()).toBe(false)
  })

  it('adds a selected local song to an existing local playlist from the context menu', async () => {
    const existingSong: Song = {
      id: 'local:track-existing',
      name: '旧歌',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'local',
      originalId: 'local:track-existing',
      extra: {
        localSource: true
      }
    }
    const nextSong: Song = {
      id: 'local:track-next',
      name: '新歌',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 0,
      mvid: 0,
      platform: 'local',
      originalId: 'local:track-next',
      extra: {
        localSource: true
      }
    }
    const localPlaylistStore = useLocalPlaylistStore()
    const playlist = localPlaylistStore.createPlaylist('我的本地歌单', [existingSong])

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
              id: 'local:track-next',
              folderId: 'folder-1',
              filePath: 'D:\\Music\\新歌.mp3',
              fileName: '新歌.mp3',
              title: '新歌',
              artist: '本地歌手',
              album: '本地专辑',
              duration: 0,
              fileSize: 1024,
              modifiedAt: Date.now(),
              coverHash: null,
              song: nextSong
            }
          ],
          nextCursor: null,
          total: 1,
          limit: 60
        })
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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
            emits: ['song-context-menu'],
            template:
              '<button class="open-local-song-menu" @contextmenu.prevent="$emit(\'song-context-menu\', { index: 0, song: songs[0], clientX: 32, clientY: 48 })">menu</button>'
          })
        }
      }
    })

    await wrapper.get('.open-local-song-menu').trigger('contextmenu')
    expect(wrapper.text()).toContain('添加到已有歌单')
    expect(wrapper.text()).toContain('我的本地歌单')

    await wrapper.get('.local-menu-playlist-item').trigger('click')

    expect(localPlaylistStore.getPlaylistById(playlist.id)?.songs.map(song => song.id)).toEqual([
      'local:track-existing',
      'local:track-next'
    ])
    expect(toastStoreMock.success).toHaveBeenCalledWith('已添加到本地歌单「我的本地歌单」')
    expect(wrapper.find('.local-song-context-menu').exists()).toBe(false)
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
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)

    expect(wrapper.text()).toContain('--:--')
  })

  it('opens and rescans a registered local library folder from folder actions', async () => {
    const showFolder = vi.fn().mockResolvedValue(true)
    const rescanFolder = vi.fn().mockResolvedValue({
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
    })

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
        rescanFolder,
        showFolder,
        status: computed(() => ({
          phase: 'idle',
          scannedFolders: 1,
          scannedFiles: 1,
          discoveredTracks: 1,
          currentFolder: null,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          message: '已收录 1 首本地歌曲'
        }))
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)
    const folderActionButtons = wrapper.findAll('.folder-chip-action')

    await folderActionButtons.find(button => button.text() === '打开')?.trigger('click')
    await folderActionButtons.find(button => button.text() === '同步')?.trigger('click')

    expect(showFolder).toHaveBeenCalledWith('folder-1')
    expect(rescanFolder).toHaveBeenCalledWith('folder-1')
    expect(toastStoreMock.success).toHaveBeenCalledWith('已同步本地音乐文件夹「Music」')
  })

  it('shows a local song in the OS folder from the song context menu', async () => {
    const showTrack = vi.fn().mockResolvedValue(true)
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
        showTrack,
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
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
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
            emits: ['song-context-menu'],
            template:
              '<button class="open-local-song-menu" @contextmenu.prevent="$emit(\'song-context-menu\', { index: 0, song: songs[0], clientX: 32, clientY: 48 })">menu</button>'
          })
        }
      }
    })

    await wrapper.get('.open-local-song-menu').trigger('contextmenu')
    expect(wrapper.find('.local-song-context-menu').exists()).toBe(true)

    await wrapper.get('.local-menu-show-in-folder').trigger('click')

    expect(showTrack).toHaveBeenCalledWith('local:track-1')
    expect(wrapper.find('.local-song-context-menu').exists()).toBe(false)
  })

  it('passes duplicate filters into local track queries from song filter toggles', async () => {
    const loadTracks = vi.fn().mockResolvedValue(undefined)
    useLocalLibraryMock.mockReturnValue(
      createLocalLibraryMock({
        loadTracks,
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
              songCount: 2
            }
          ],
          tracks: [],
          status: {
            phase: 'idle',
            scannedFolders: 1,
            scannedFiles: 2,
            discoveredTracks: 2,
            currentFolder: null,
            startedAt: Date.now(),
            finishedAt: Date.now(),
            message: '已收录 2 首本地歌曲'
          }
        }),
        status: computed(() => ({
          phase: 'idle',
          scannedFolders: 1,
          scannedFiles: 2,
          discoveredTracks: 2,
          currentFolder: null,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          message: '已收录 2 首本地歌曲'
        }))
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)
    const filterButtons = wrapper.findAll('.duplicate-filter-toggle')

    await filterButtons[0]?.trigger('click')
    expect(wrapper.find('.search-clear').exists()).toBe(false)
    expect(loadTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        duplicateMode: 'strict',
        hideDuplicates: true,
        showDuplicatesOnly: undefined
      })
    )

    await filterButtons[1]?.trigger('click')
    expect(loadTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        duplicateMode: 'strict',
        hideDuplicates: undefined,
        showDuplicatesOnly: true
      })
    )
  })

  it('loads the inbox view with the recently-added track query', async () => {
    const loadTracks = vi.fn().mockResolvedValue(undefined)
    useLocalLibraryMock.mockReturnValue(
      createLocalLibraryMock({
        loadTracks,
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
              songCount: 0
            }
          ],
          tracks: [],
          status: {
            phase: 'idle',
            scannedFolders: 1,
            scannedFiles: 0,
            discoveredTracks: 0,
            currentFolder: null,
            startedAt: Date.now(),
            finishedAt: Date.now(),
            message: '已收录 0 首本地歌曲'
          }
        }),
        status: computed(() => ({
          phase: 'idle',
          scannedFolders: 1,
          scannedFiles: 0,
          discoveredTracks: 0,
          currentFolder: null,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          message: '已收录 0 首本地歌曲'
        }))
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)

    await wrapper
      .findAll('.view-tab')
      .find(button => button.text() === '新入库')
      ?.trigger('click')

    expect(loadTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        recentlyAddedOnly: true
      }),
      false
    )
    expect(wrapper.text()).toContain('最近没有新入库歌曲')
  })

  it('shows local library health, metadata candidate, and native output diagnostics', async () => {
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
              songCount: 8
            }
          ],
          tracks: [],
          health: {
            duplicateGroupCount: 1,
            duplicateTrackCount: 2,
            enabledFolderCount: 1,
            folderCount: 1,
            hiddenDuplicateTrackCount: 1,
            inboxTrackCount: 3,
            missingCoverCount: 2,
            missingDurationCount: 1,
            missingTechnicalMetadataCount: 4,
            staleTrackCount: 0,
            trackCount: 8,
            updatedAt: Date.now()
          },
          metadataCandidateSummary: {
            byField: {
              album: 1,
              artist: 0,
              cover: 2,
              duration: 0,
              technical: 1,
              title: 0
            },
            bySource: {
              folder: 1,
              unknown: 3
            },
            pendingCount: 4,
            updatedAt: Date.now()
          },
          status: {
            phase: 'idle',
            scannedFolders: 1,
            scannedFiles: 8,
            discoveredTracks: 8,
            currentFolder: null,
            startedAt: Date.now(),
            finishedAt: Date.now(),
            message: '已收录 8 首本地歌曲'
          }
        }),
        status: computed(() => ({
          phase: 'idle',
          scannedFolders: 1,
          scannedFiles: 8,
          discoveredTracks: 8,
          currentFolder: null,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          message: '已收录 8 首本地歌曲'
        }))
      })
    )

    const { default: HomeLocalMusicPanel } =
      await import('@/features/home/components/HomeLocalMusicPanel.vue')
    const wrapper = mount(HomeLocalMusicPanel)
    const text = wrapper.text()

    expect(text).toContain('曲库健康')
    expect(text).toContain('8 首')
    expect(text).toContain('新入库')
    expect(text).toContain('3 首')
    expect(text).toContain('元数据候选')
    expect(text).toContain('4 项')
    expect(text).toContain('原生输出')
    expect(text).toContain('播放中')
    expect(text).toContain('输出时钟')
    expect(text).toContain('44100 Hz')
    expect(text).toContain('48000 Hz')
  })
})
