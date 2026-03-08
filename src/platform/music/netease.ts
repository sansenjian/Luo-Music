
import { MusicPlatformAdapter, createSong, type Song, type SearchResult, type LyricResult, type PlaylistDetail } from './interface';
import { neteaseAdapter } from '../../api/netease';
import type { ApiResponse } from '../../api/adapter';

export class NeteaseAdapter extends MusicPlatformAdapter {
  constructor() {
    super('netease');
  }

  async search(keyword: string, limit: number = 30, page: number = 1): Promise<SearchResult> {
    const offset = (page - 1) * limit;
    const res = await neteaseAdapter.fetch<any>('/cloudsearch', {
      keywords: keyword,
      type: 1,
      limit,
      offset
    });

    if (!res.success) {
      console.warn('Netease search failed:', res.error);
      return { list: [], total: 0 };
    }

    const songs = (res.data.result?.songs || []).map((song: any) => this._normalizeSong(song));
    return {
      list: songs,
      total: res.data.result?.songCount || 0
    };
  }

  async getSongUrl(id: string | number, options: any = 'standard'): Promise<string | null> {
    let level = 'standard';
    if (typeof options === 'string') {
      level = options;
    } else if (typeof options === 'object' && options !== null) {
      level = options.level || 'standard';
    }

    try {
      const res: any = await neteaseAdapter.fetch<any>('/song/url/v1', {
        id,
        level,
        randomCNIP: true,
        unblock: 'true',
        timestamp: Date.now()
      });

      if (!res.success) {
        throw new Error('Failed to get song URL');
      }

      const data = res.data.data || res.data;
      if (data && data[0] && data[0].url) {
        return data[0].url;
      }
      return null;
    } catch (error) {
      console.warn('Netease getSongUrl failed, fallback needed', error);
      throw error;
    }
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res = await neteaseAdapter.fetch<any>('/song/detail', {
      ids: String(id),
      timestamp: Date.now()
    });

    if (!res.success) {
      console.warn('Netease song detail failed:', res.error);
      return null;
    }

    const song = res.data.songs && res.data.songs[0];
    if (song) {
      return this._normalizeSong(song);
    }
    return null;
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res = await neteaseAdapter.fetch<any>('/lyric', {
      id,
      timestamp: Date.now()
    });

    if (!res.success) {
      console.warn('Netease lyric failed:', res.error);
      return { lrc: '', tlyric: '', romalrc: '' };
    }

    return {
      lrc: res.data.lrc?.lyric || res.data.lyric || '',
      tlyric: res.data.tlyric?.lyric || res.data.tlyric || '',
      romalrc: res.data.romalrc?.lyric || res.data.romalrc || ''
    };
  }
  
  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    const res = await neteaseAdapter.fetch<any>('/playlist/detail', { id });

    if (!res.success) {
      console.warn('Netease playlist detail failed:', res.error);
      return null;
    }

    const playlist = res.data.playlist;
    
    if (!playlist) return null;

    const tracks = (playlist.tracks || []).map((track: any) => this._normalizeSong(track));

    return {
      id: playlist.id,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl,
      description: playlist.description,
      trackCount: playlist.trackCount,
      tracks: tracks
    };
  }

  private _normalizeSong(song: any): Song {
    return createSong({
      id: song.id,
      name: song.name,
      artists: (song.ar || song.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
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
