import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchResultItem } from '@/store/searchStore'
import { useSearch } from '@/composables/useSearch'

const searchMock = vi.fn()
const clearResultsMock = vi.fn()
const setServerMock = vi.fn()
const playResultMock = vi.fn()
const addToPlaylistMock = vi.fn()
const addAllToPlaylistMock = vi.fn()

let mockResults: SearchResultItem[] = []
let mockHasResults = false
let mockError: string | null = null

const mockSearchStore = {
  keyword: 'test',
  get results() {
    return mockResults
  },
  totalResults: 0,
  isLoading: false,
  get error() {
    return mockError
  },
  server: 'netease',
  get hasResults() {
    return mockHasResults
  },
  search: searchMock,
  clearResults: clearResultsMock,
  setServer: setServerMock,
  playResult: playResultMock,
  addToPlaylist: addToPlaylistMock,
  addAllToPlaylist: addAllToPlaylistMock
}

describe('useSearch', () => {
  beforeEach(() => {
    mockResults = []
    mockHasResults = false
    mockError = null
    mockSearchStore.totalResults = 0
    mockSearchStore.server = 'netease'
    vi.clearAllMocks()
  })

  it('proxies store state through computed properties', () => {
    const { keyword, results, total, loading, error, platform, hasResults } = useSearch({
      searchStore: mockSearchStore
    })

    expect(keyword.value).toBe('test')
    expect(results.value).toEqual([])
    expect(total.value).toBe(0)
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(platform.value).toBe('netease')
    expect(hasResults.value).toBe(false)
  })

  it('returns success when search finds results', async () => {
    const fakeResults: SearchResultItem[] = [
      {
        id: 1,
        name: 'Song',
        artist: 'A',
        album: 'B',
        pic: '',
        cover: '',
        url: null,
        platform: 'netease',
        duration: 180
      }
    ]
    mockResults = fakeResults
    mockSearchStore.totalResults = 1
    mockHasResults = true
    searchMock.mockResolvedValue(undefined)

    const { search } = useSearch({ searchStore: mockSearchStore })
    const result = await search('jay')

    expect(searchMock).toHaveBeenCalledWith('jay')
    expect(result).toEqual({ success: true, results: fakeResults, total: 1 })
  })

  it('returns error when search finds no results', async () => {
    mockHasResults = false
    mockError = 'No songs found'
    searchMock.mockResolvedValue(undefined)

    const { search } = useSearch({ searchStore: mockSearchStore })
    const result = await search('xyz')

    expect(result).toEqual({ success: false, error: 'No songs found' })
  })

  it('delegates clear to searchStore', () => {
    const { clear } = useSearch({ searchStore: mockSearchStore })
    clear()
    expect(clearResultsMock).toHaveBeenCalled()
  })

  it('delegates setPlatform to searchStore', () => {
    const { setPlatform } = useSearch({ searchStore: mockSearchStore })
    setPlatform('qq')
    expect(setServerMock).toHaveBeenCalledWith('qq')
  })

  it('getSongAt returns the item at a valid index', () => {
    const item: SearchResultItem = {
      id: 1,
      name: 'Song',
      artist: 'A',
      album: 'B',
      pic: '',
      cover: '',
      url: null,
      platform: 'netease',
      duration: 180
    }
    mockResults = [item]

    const { getSongAt } = useSearch({ searchStore: mockSearchStore })
    expect(getSongAt(0)).toEqual(item)
  })

  it('getSongAt returns null for out-of-range indices', () => {
    mockResults = []

    const { getSongAt } = useSearch({ searchStore: mockSearchStore })
    expect(getSongAt(-1)).toBeNull()
    expect(getSongAt(5)).toBeNull()
  })

  it('delegates playResult and addToPlaylist', () => {
    const { playResult, addToPlaylist } = useSearch({ searchStore: mockSearchStore })

    void playResult(2)
    expect(playResultMock).toHaveBeenCalledWith(2)

    void addToPlaylist(3)
    expect(addToPlaylistMock).toHaveBeenCalledWith(3)
  })

  it('delegates addAllToPlaylist', () => {
    const { addAllToPlaylist } = useSearch({ searchStore: mockSearchStore })
    addAllToPlaylist()
    expect(addAllToPlaylistMock).toHaveBeenCalled()
  })
})
