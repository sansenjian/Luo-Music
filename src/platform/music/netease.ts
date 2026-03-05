
import { MusicPlatformAdapter, createSong, type Song, type SearchResult, type LyricResult, type PlaylistDetail } from './interface';
// @ts-ignore
import { search } from '../../api/search';
import { getMusicUrl, getLyric, getSongDetail } from '../../api/song';
// @ts-ignore
import { getPlaylistDetail } from '../../api/playlist';

export class NeteaseAdapter extends MusicPlatformAdapter {
  constructor() {
    super('netease');
  }

  async search(keyword: string, limit: number = 30, page: number = 1): Promise<SearchResult> {
    const offset = (page - 1) * limit;
    const res: any = await search(keyword, 1, limit, offset);
    
    // Normalize response
    const songs = (res.result?.songs || []).map((song: any) => this._normalizeSong(song));
    return {
      list: songs,
      total: res.result?.songCount || 0
    };
  }

  async getSongUrl(id: string | number, options: any = 'standard'): Promise<string | null> {
    let level = 'standard';
    if (typeof options === 'string') {
      level = options;
    } else if (typeof options === 'object' && options !== null) {
      level = options.level || 'standard';
    }

    const res: any = await getMusicUrl(id as any, level);
    const data = res.data || res;
    if (data && data[0] && data[0].url) {
      return data[0].url;
    }
    return null;
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res: any = await getSongDetail(id as any);
    const song = res.songs && res.songs[0];
    if (song) {
      return this._normalizeSong(song);
    }
    return null;
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res: any = await getLyric(id as any);
    return {
      lrc: res.lrc?.lyric || res.lyric || '',
      tlyric: res.tlyric?.lyric || res.tlyric || '',
      romalrc: res.romalrc?.lyric || res.romalrc || ''
    };
  }
  
  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    const res: any = await getPlaylistDetail(id as any);
    const playlist = res.playlist;
    
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
