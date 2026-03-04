
import { MusicPlatformAdapter, createSong, type Song, type SearchResult, type LyricResult } from './interface';
// @ts-ignore
import { qqMusicApi } from '../../api/qqmusic';

export class QQMusicAdapter extends MusicPlatformAdapter {
  constructor() {
    super('qq');
  }

  async search(keyword: string, limit: number = 20, page: number = 1): Promise<SearchResult> {
    const res = await qqMusicApi.search(keyword, limit, page);
    
    // Normalize response
    const list = res.data?.list || [];
    const total = res.data?.total || 0;
    
    return {
      list: list.map((song: any) => this._normalizeSong(song)),
      total: total
    };
  }

  async getSongUrl(id: string | number, options: any = {}): Promise<string | null> {
    // QQ Music needs mediaId sometimes, but let's assume id is songmid
    // We might need to fetch song info first if we don't have mediaId
    // But for now, let's see if we can just use the API provided
    
    // In many QQ APIs, we need mediaId (strMediaMid) to get play url.
    // If the caller only provides ID (songmid), we might need to fetch detail first.
    // However, the existing qqMusicApi.getMusicPlay takes (songmid, mediaId).
    
    // Ideally, the 'id' passed here is the song object or we have a way to get mediaId.
    // If 'id' is just a string, we might struggle.
    // Let's assume the normalized song object's ID is songmid.
    
    // Hack: If options contains mediaId, use it. Otherwise, try to fetch it.
    let mediaId = options.mediaId;
    
    if (!mediaId) {
       // Try to fetch song detail to get mediaId
       try {
         const info = await qqMusicApi.getSongInfo(id);
         if (info && info.data && info.data.track_info) {
             mediaId = info.data.track_info.file?.media_mid;
         }
       } catch (e) {
         console.warn('Failed to fetch mediaId for QQ song', id);
       }
    }

    const res = await qqMusicApi.getMusicPlay(id, mediaId);
    const playUrl = res.data?.playUrl?.[id];
    if (playUrl && playUrl.url) {
      return playUrl.url;
    }
    return null;
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res = await qqMusicApi.getSongInfo(id);
    const data = res.data?.track_info;
    if (data) {
      return this._normalizeSong(data);
    }
    return null;
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res: any = await qqMusicApi.getLyric(id, false);
    return {
      lrc: res.response?.lyric?.lyric || '',
      tlyric: res.response?.trans || '',
      romalrc: '' // QQ usually doesn't provide roma via this API
    };
  }

  async getPlaylistDetail(id: string | number): Promise<any> {
      // TODO: Implement playlist detail for QQ if API available
      throw new Error('Method not implemented.');
  }

  private _normalizeSong(song: any): Song {
    // QQ Music structure varies between search and detail
    // Search: { songmid, songname, singer: [...], albummid, albumname ... }
    // Detail: { mid, name, singer: [...], album: { mid, name } ... }
    
    const songmid = song.songmid || song.mid;
    const songname = song.songname || song.name || song.title;
    const singers = song.singer || [];
    const album = song.album || {};
    const albummid = song.albummid || album.mid;
    const albumname = song.albumname || album.name;
    const duration = song.interval || 0;
    
    return createSong({
      id: songmid,
      name: songname,
      artists: singers.map((s: any) => ({ id: s.mid, name: s.name })),
      album: {
        id: albummid,
        name: albumname,
        picUrl: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : ''
      },
      duration: duration * 1000,
      mvid: song.vid || '',
      platform: 'qq',
      originalId: song.songid || song.id,
      extra: {
        mediaId: song.strMediaMid || song.file?.media_mid
      }
    });
  }
}
