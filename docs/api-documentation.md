# API 文档

## 概述

本文档描述了 Luo Music 项目的 API 接口。所有 API 都基于 NeteaseCloudMusicApi Enhanced 服务。

**Base URL**: `http://localhost:14532`

## 搜索相关 API

### search
搜索歌曲、专辑、歌手等

```javascript
import { search } from '@/api/search'

// 调用示例
const result = await search('周杰伦', 1, 30, 0)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| keywords | string | 是 | - | 搜索关键词 |
| type | number | 否 | 1 | 搜索类型: 1-单曲, 10-专辑, 100-歌手, 1000-歌单, 1002-用户, 1004-MV, 1006-歌词, 1009-电台, 1014-视频 |
| limit | number | 否 | 30 | 返回数量 |
| offset | number | 否 | 0 | 偏移量 |

**返回值**:
```typescript
{
  result: {
    songs: Array<{
      id: number
      name: string
      artists: Array<{ name: string }>
      album: { name: string }
      duration: number
    }>
  }
}
```

---

### searchSuggest
获取搜索建议

```javascript
import { searchSuggest } from '@/api/search'

const result = await searchSuggest('周杰伦')
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| keywords | string | 是 | 搜索关键词 |

---

### getHotSearch
获取热搜列表

```javascript
import { getHotSearch } from '@/api/search'

const result = await getHotSearch()
```

**返回值**:
```typescript
{
  data: Array<{
    searchWord: string
    score: number
    content: string
  }>
}
```

## 歌曲相关 API

### getNewestSong
获取推荐新音乐

```javascript
import { getNewestSong } from '@/api/song'

const result = await getNewestSong(10)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| limit | number | 否 | 10 | 数量 |

---

### checkMusic
检查音乐是否可用

```javascript
import { checkMusic } from '@/api/song'

const result = await checkMusic(123456)
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 歌曲 ID |

---

### getMusicUrl
获取音乐 URL

```javascript
import { getMusicUrl } from '@/api/song'

const result = await getMusicUrl(123456, 'standard')
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | number | 是 | - | 歌曲 ID |
| level | string | 否 | 'standard' | 音质等级: standard, higher, exhigh, lossless, hires |

**返回值**:
```typescript
{
  data: Array<{
    id: number
    url: string
    size: number
    type: string
  }>
}
```

---

### getLyric
获取歌词

```javascript
import { getLyric } from '@/api/song'

const result = await getLyric(123456)
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 歌曲 ID |

**返回值**:
```typescript
{
  lrc: {
    lyric: string  // LRC 格式歌词
    version: number
  }
  tlyric?: {
    lyric: string  // 翻译歌词
    version: number
  }
  romalrc?: {
    lyric: string  // 罗马音歌词
    version: number
  }
}
```

---

### getSongDetail
获取歌曲详情

```javascript
import { getSongDetail } from '@/api/song'

const result = await getSongDetail('123456,789012')
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| ids | string | 是 | 歌曲 ID，多个用逗号分隔 |

---

### likeMusic
喜欢/取消喜欢音乐

```javascript
import { likeMusic } from '@/api/song'

// 喜欢
await likeMusic(123456, true)

// 取消喜欢
await likeMusic(123456, false)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | number | 是 | - | 歌曲 ID |
| like | boolean | 否 | true | 是否喜欢 |

## 歌单相关 API

### getRecommendPlaylist
获取推荐歌单

```javascript
import { getRecommendPlaylist } from '@/api/playlist'

const result = await getRecommendPlaylist(10)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| limit | number | 否 | 10 | 数量 |

---

### getPlaylistDetail
获取歌单详情

```javascript
import { getPlaylistDetail } from '@/api/playlist'

const result = await getPlaylistDetail(123456)
```

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 歌单 ID |

---

### getPlaylistTracks
获取歌单所有歌曲

```javascript
import { getPlaylistTracks } from '@/api/playlist'

const result = await getPlaylistTracks(123456, 100, 0)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | number | 是 | - | 歌单 ID |
| limit | number | 否 | 100 | 数量 |
| offset | number | 否 | 0 | 偏移量 |

---

### getRecommendSongs
获取每日推荐歌曲

```javascript
import { getRecommendSongs } from '@/api/playlist'

const result = await getRecommendSongs()
```

**注意**: 需要登录

## 错误处理

所有 API 请求统一返回 Promise，使用 try-catch 处理错误：

```javascript
import { search } from '@/api/search'

try {
  const result = await search('周杰伦')
  console.log(result)
} catch (error) {
  console.error('搜索失败:', error.message)
}
```

## 类型定义

### Song 类型

```typescript
interface Song {
  id: number
  name: string
  artists: Artist[]
  album: Album
  duration: number
  url?: string
  cover?: string
}

interface Artist {
  id: number
  name: string
}

interface Album {
  id: number
  name: string
  picUrl?: string
}
```

### Lyric 类型

```typescript
interface Lyric {
  time: number
  lyric: string
  tlyric?: string
  rlyric?: string
}
```
