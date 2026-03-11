import { 
  MusicPlatformAdapter, 
  createSong, 
  type Song, 
  type SearchResult, 
  type LyricResult, 
  type PlaylistDetail,
  type SongUrlOptions
} from './interface';
import { neteaseAdapter } from '../../api/netease';
import { validateSearchResponse } from '../../api/responseHandler';

/** 网易云 API 响应基础结构 */
interface NeteaseResponse<T = unknown> {
  success: boolean;
  code?: number;
  error?: string;
  data?: T;
}

/** 网易云歌曲数据结构 */
interface NeteaseSongData {
  id: number;
  name: string;
  ar?: Array<{ id: number; name: string }>;
  artists?: Array<{ id: number; name: string }>;
  al?: { id: number; name: string; picUrl?: string };
  album?: { id: number; name: string; picUrl?: string; artist?: { img1v1Url?: string } };
  dt?: number;
  duration?: number;
  mv?: number;
  mvid?: number;
}

/** 网易云歌词数据结构 */
interface NeteaseLyricData {
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
  romalrc?: { lyric?: string };
  lyric?: string;
  tlyric?: string;
}

/** 网易云歌曲 URL 数据结构 */
interface NeteaseUrlData {
  url?: string;
  data?: Array<{ url?: string }>;
}

/** 网易云歌单数据结构 */
interface NeteasePlaylistData {
  id: number;
  name: string;
  coverImgUrl?: string;
  description?: string;
  trackCount?: number;
  tracks?: NeteaseSongData[];
}

export class NeteaseAdapter extends MusicPlatformAdapter {
  constructor() {
    super('netease');
  }

  async search(keyword: string, limit: number = 30, page: number = 1): Promise<SearchResult> {
    const offset = (page - 1) * limit;
    
    console.log('[NeteaseAdapter] Searching:', { keyword, limit, offset });
    
    const res = await neteaseAdapter.fetch<NeteaseResponse>('/cloudsearch', {
      keywords: keyword,
      type: 1,  // 1: 单曲
      limit,
      offset
    });

    console.log('[NeteaseAdapter] Response:', res);

    if (!res.success) {
      const errorMsg = res.error || `请求失败 (code: ${res.code})`;
      console.warn('[NeteaseAdapter] Search failed:', errorMsg);
      throw new Error(`网易云搜索失败: ${errorMsg}`);
    }

    // 使用统一的响应验证
    const validation = validateSearchResponse(res.data);
    
    if (!validation.valid) {
      console.warn('[NeteaseAdapter] Invalid data format:', validation.error);
      return { list: [], total: 0 };
    }

    console.log('[NeteaseAdapter] Parsed results:', { 
      count: validation.list.length, 
      total: validation.total 
    });

    return {
      list: validation.list.map((song: NeteaseSongData) => this._normalizeSong(song)),
      total: validation.total
    };
  }

  async getSongUrl(id: string | number, options: SongUrlOptions | string = 'standard'): Promise<string | null> {
    let level = 'standard';
    if (typeof options === 'string') {
      level = options;
    } else if (typeof options === 'object' && options !== null) {
      level = options.level || 'standard';
    }

    console.log('[NeteaseAdapter] Getting song URL:', { id, level, optionsType: typeof options, options });

    // 首先尝试 v1 接口
    try {
      const res = await neteaseAdapter.fetch<NeteaseResponse<NeteaseUrlData>>('/song/url/v1', {
        id,
        level,
        randomCNIP: true,
        unblock: 'true',
        timestamp: Date.now()
      });

      console.log('[NeteaseAdapter] v1 response:', res);

      if (res.success) {
        const data = res.data?.data || res.data;
        if (data && data[0] && data[0].url) {
          console.log('[NeteaseAdapter] Got URL from v1:', data[0].url.substring(0, 50) + '...');
          return data[0].url;
        }
      }
      
      console.warn('[NeteaseAdapter] v1 API returned no URL, trying legacy API...');
    } catch (error) {
      console.warn('[NeteaseAdapter] v1 API failed:', error);
    }

    // 降级到旧版接口
    try {
      // 映射 level 到 br
      let br = 128000;
      switch (level) {
        case 'standard': br = 128000; break;
        case 'higher': br = 192000; break;
        case 'exhigh': br = 320000; break;
        case 'lossless': br = 999000; break;
        case 'hires': br = 999000; break;
        default: br = 128000;
      }

      const res = await neteaseAdapter.fetch<NeteaseResponse<NeteaseUrlData>>('/song/url', {
        id,
        br,
        randomCNIP: true,
        timestamp: Date.now()
      });

      console.log('[NeteaseAdapter] Legacy response:', res);

      if (res.success) {
        const data = res.data?.data || res.data;
        if (data && data[0] && data[0].url) {
          console.log('[NeteaseAdapter] Got URL from legacy:', data[0].url.substring(0, 50) + '...');
          return data[0].url;
        }
      }
    } catch (error) {
      console.error('[NeteaseAdapter] Legacy API also failed:', error);
    }

    console.error('[NeteaseAdapter] Failed to get song URL for:', id);
    return null;
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res = await neteaseAdapter.fetch<NeteaseResponse<{ songs?: NeteaseSongData[] } | NeteaseSongData>>('/song/detail', {
      ids: String(id),
      timestamp: Date.now()
    });

    if (!res.success) {
      console.warn('Netease song detail failed:', res.error);
      return null;
    }

    const songs = res.data?.songs || res.data;
    const song = Array.isArray(songs) ? songs[0] : songs;
    
    return song ? this._normalizeSong(song as NeteaseSongData) : null;
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res = await neteaseAdapter.fetch<NeteaseResponse<NeteaseLyricData>>('/lyric', {
      id,
      timestamp: Date.now()
    });

    if (!res.success) {
      console.warn('Netease lyric failed:', res.error);
      return { lrc: '', tlyric: '', romalrc: '' };
    }

    const data = res.data || res;
    return {
      lrc: data.lrc?.lyric || data.lyric || '',
      tlyric: data.tlyric?.lyric || data.tlyric || '',
      romalrc: data.romalrc?.lyric || data.romalrc || ''
    };
  }
  
  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    const res = await neteaseAdapter.fetch<NeteaseResponse<{ playlist?: NeteasePlaylistData } | NeteasePlaylistData>>('/playlist/detail', { id });

    if (!res.success) {
      console.warn('Netease playlist detail failed:', res.error);
      return null;
    }

    const playlist = res.data?.playlist || res.data;
    
    if (!playlist) return null;

    const tracks = (playlist.tracks || []).map((track: NeteaseSongData) => this._normalizeSong(track));

    return {
      id: playlist.id,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl,
      description: playlist.description,
      trackCount: playlist.trackCount,
      tracks
    };
  }

  private _normalizeSong(song: NeteaseSongData): Song {
    return createSong({
      id: song.id,
      name: song.name,
      artists: (song.ar || song.artists || []).map((a: { id: number; name: string }) => ({ 
        id: a.id, 
        name: a.name 
      })),
      album: {
        id: song.al?.id || song.album?.id,
        name: song.al?.name || song.album?.name,
        picUrl: song.al?.picUrl || song.album?.picUrl || song.album?.artist?.img1v1Url
      },
      duration: song.dt || song.duration || 0,
      mvid: song.mv || song.mvid || 0,
      platform: 'netease',
      originalId: song.id
    });
  }
}
