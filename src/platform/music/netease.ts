import {
  MusicPlatformAdapter,
  createSong,
  type LyricResult,
  type PlaylistDetail,
  type SearchResult,
  type Song,
  type SongUrlOptions
} from './interface'
import { neteaseAdapter } from '@/api/netease'
import { validateSearchResponse } from '@/api/responseHandler'
import { getBitrateByLevel, DEFAULT_AUDIO_BITRATE } from '@/constants/audio'

interface NeteaseSongData {
  id?: number
  name?: string
  ar?: Array<{ id?: number; name?: string }>
  artists?: Array<{ id?: number; name?: string }>
  al?: { id?: number; name?: string; picUrl?: string }
  album?: {
    id?: number
    name?: string
    picUrl?: string
    artist?: { img1v1Url?: string }
  }
  dt?: number
  duration?: number
  mv?: number
  mvid?: number
}

interface NeteaseLyricData {
  lrc?: { lyric?: string }
  tlyric?: { lyric?: string } | string
  romalrc?: { lyric?: string } | string
  lyric?: string
}

interface NeteaseUrlItem {
  url?: string | null
}

interface NeteasePlaylistData {
  id?: number
  name?: string
  coverImgUrl?: string
  description?: string
  trackCount?: number
  tracks?: NeteaseSongData[]
}

function normalizeUrlItems(data: unknown): NeteaseUrlItem[] {
  if (Array.isArray(data)) {
    return data as NeteaseUrlItem[]
  }

  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: NeteaseUrlItem[] }).data
  }

  return []
}

export class NeteaseAdapter extends MusicPlatformAdapter {
  constructor() {
    super('netease')
  }

  async search(keyword: string, limit = 30, page = 1): Promise<SearchResult> {
    const offset = (page - 1) * limit
    const response = await neteaseAdapter.fetch<unknown>('/cloudsearch', {
      keywords: keyword,
      type: 1,
      limit,
      offset
    })

    if (!response.success) {
      throw new Error(`网易云搜索失败: ${response.error || response.code || 'unknown error'}`)
    }

    const validation = validateSearchResponse(response.data)
    if (!validation.valid) {
      return { list: [], total: 0 }
    }

    return {
      list: validation.list.map(song => this.normalizeSong(song as NeteaseSongData)),
      total: validation.total
    }
  }

  async getSongUrl(
    id: string | number,
    options: SongUrlOptions | string = 'standard'
  ): Promise<string | null> {
    const level = typeof options === 'string' ? options : options.level || 'standard'

    // Try v1 API first
    try {
      const v1Response = await neteaseAdapter.fetch<unknown>('/song/url/v1', {
        id,
        level,
        randomCNIP: true,
        unblock: 'true',
        timestamp: Date.now()
      })

      const v1Url = v1Response ? normalizeUrlItems(v1Response.data)[0]?.url : null
      if (v1Response?.success && v1Url) {
        return v1Url
      }
    } catch {
      // v1 API failed, fall back to legacy API
    }

    const legacyResponse = await neteaseAdapter.fetch<unknown>('/song/url', {
      id,
      br: getBitrateByLevel(level, DEFAULT_AUDIO_BITRATE),
      randomCNIP: true,
      timestamp: Date.now()
    })

    return legacyResponse.success ? (normalizeUrlItems(legacyResponse.data)[0]?.url ?? null) : null
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const response = await neteaseAdapter.fetch<unknown>('/song/detail', {
      ids: String(id),
      timestamp: Date.now()
    })

    if (!response.success || !response.data || typeof response.data !== 'object') {
      return null
    }

    const songs = Array.isArray((response.data as { songs?: unknown }).songs)
      ? (response.data as { songs: NeteaseSongData[] }).songs
      : Array.isArray(response.data)
        ? (response.data as NeteaseSongData[])
        : [response.data as NeteaseSongData]

    return songs[0] ? this.normalizeSong(songs[0]) : null
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const response = await neteaseAdapter.fetch<NeteaseLyricData>('/lyric', {
      id,
      timestamp: Date.now()
    })

    const data = response.data
    const tlyric = typeof data?.tlyric === 'string' ? data.tlyric : data?.tlyric?.lyric
    const romalrc = typeof data?.romalrc === 'string' ? data.romalrc : data?.romalrc?.lyric
    return {
      lrc: data?.lrc?.lyric || data?.lyric || '',
      tlyric: tlyric || '',
      romalrc: romalrc || ''
    }
  }

  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    const response = await neteaseAdapter.fetch<unknown>('/playlist/detail', { id })

    if (!response.success || !response.data || typeof response.data !== 'object') {
      return null
    }

    const playlist = ((response.data as { playlist?: unknown }).playlist ||
      response.data) as NeteasePlaylistData
    if (!playlist.id || !playlist.name) {
      return null
    }

    return {
      id: playlist.id,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl || '',
      description: playlist.description,
      trackCount: playlist.trackCount,
      tracks: (playlist.tracks || []).map(track => this.normalizeSong(track))
    }
  }

  private normalizeSong(song: NeteaseSongData): Song {
    return createSong({
      id: song.id || 0,
      name: song.name || '',
      artists: (song.ar || song.artists || []).map(artist => ({
        id: artist.id || 0,
        name: artist.name || ''
      })),
      album: {
        id: song.al?.id || song.album?.id || 0,
        name: song.al?.name || song.album?.name || '',
        picUrl: song.al?.picUrl || song.album?.picUrl || song.album?.artist?.img1v1Url || ''
      },
      duration: song.dt || song.duration || 0,
      mvid: song.mv || song.mvid || 0,
      platform: 'netease',
      originalId: song.id || 0
    })
  }
}
