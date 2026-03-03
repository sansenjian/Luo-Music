# API 文档

## 📋 概述

本文档描述了 LUO Music 项目的 API 接口。项目支持**双平台**：网易云音乐和 QQ 音乐。

### 服务地址

| 平台 | Base URL | 说明 |
|------|----------|------|
| **网易云音乐** | `http://localhost:14532` | NeteaseCloudMusicApi Enhanced |
| **QQ 音乐** | `http://localhost:3200` | QQ Music API (sansenjian 版本) |

---

## 🔍 搜索相关 API

### 网易云音乐搜索

#### search
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
| type | number | 否 | 1 | 搜索类型：1-单曲，10-专辑，100-歌手，1000-歌单，1002-用户，1004-MV，1006-歌词，1009-电台，1014-视频 |
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

#### searchSuggest
获取搜索建议

```javascript
import { searchSuggest } from '@/api/search'

const result = await searchSuggest('周杰伦')
```

**参数**:
- `keywords` (string): 搜索关键词

---

#### getHotSearch
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

---

### QQ 音乐搜索

#### qqMusicSearch
搜索歌曲（QQ 音乐）

```javascript
import { qqMusicApi } from '@/api/qqmusic'

// 调用示例
const result = await qqMusicApi.search('周杰伦', 30, 1)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| keyword | string | 是 | - | 搜索关键词 |
| limit | number | 否 | 30 | 返回数量 |
| page | number | 否 | 1 | 页码 |

**返回值**:
```typescript
{
  response: {
    data: {
      song: {
        list: Array<{
          songmid: string      // 歌曲 ID
          strMediaMid: string  // 媒体 ID（播放必需）
          songname: string     // 歌曲名
          singer: Array<{ name: string }>
          album: { name: string, mid: string }
          interval: number     // 时长（秒）
        }>
      }
    }
  }
}
```

**注意事项**:
- ⚠️ QQ 音乐搜索返回的 `songmid` 用作歌曲 ID
- ⚠️ 播放时需要 `strMediaMid` 作为 `mediaId` 参数

---

## 🎵 歌曲相关 API

### 网易云音乐

#### getMusicUrl
获取音乐 URL

```javascript
import { getMusicUrl } from '@/api/song'

const result = await getMusicUrl(123456, 'standard')
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id | number | 是 | - | 歌曲 ID |
| level | string | 否 | 'standard' | 音质等级：standard, higher, exhigh, lossless, hires |

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

#### getLyric
获取歌词

```javascript
import { getLyric } from '@/api/song'

const result = await getLyric(123456)
```

**参数**:
- `id` (number): 歌曲 ID

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

#### getSongDetail
获取歌曲详情

```javascript
import { getSongDetail } from '@/api/song'

const result = await getSongDetail('123456,789012')
```

**参数**:
- `ids` (string): 歌曲 ID，多个用逗号分隔

---

#### checkMusic
检查音乐是否可用

```javascript
import { checkMusic } from '@/api/song'

const result = await checkMusic(123456)
```

**参数**:
- `id` (number): 歌曲 ID

---

#### likeMusic
喜欢/取消喜欢音乐

```javascript
import { likeMusic } from '@/api/song'

// 喜欢
await likeMusic(123456, true)

// 取消喜欢
await likeMusic(123456, false)
```

**参数**:
- `id` (number): 歌曲 ID
- `like` (boolean): 是否喜欢（默认 true）

---

### QQ 音乐

#### getMusicPlay
获取音乐播放 URL（QQ 音乐）

```javascript
import { qqMusicApi } from '@/api/qqmusic'

// 调用示例
const result = await qqMusicApi.getMusicPlay(songmid, mediaId, 128)
```

**参数**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| songmid | string | 是 | - | 歌曲 ID |
| mediaId | string | 是 | - | 媒体 ID（strMediaMid，必需！） |
| quality | number | 否 | 128 | 音质：128, 320, flac |

**返回值**:
```typescript
{
  data: {
    url: string  // 播放 URL
    size: number
    type: string
  }
}
```

**注意事项**:
- ⚠️ **必须提供 mediaId**（strMediaMid），否则无法播放
- ⚠️ 建议默认使用 128 音质，VIP 歌曲可能需要登录
- ⚠️ 登录状态通过 Cookie 自动管理

---

#### getLyric (QQ 音乐)
获取歌词（QQ 音乐）

```javascript
import { qqMusicApi } from '@/api/qqmusic'

const result = await qqMusicApi.getLyric(songmid, true)
```

**参数**:
- `songmid` (string): 歌曲 ID
- `isFormat` (boolean): 是否格式化（默认 false）

**返回值**:
```typescript
{
  lyric: string  // LRC 格式歌词
  trans?: string // 翻译歌词（可能为空）
}
```

**注意事项**:
- ⚠️ QQ 音乐的翻译歌词可能为空（数据源限制）
- ⚠️ 很多歌曲的 `trans` 字段为空字符串

---

## 🎤 登录相关 API

### QQ 音乐登录

#### getQQLoginQr
获取登录二维码

```javascript
import { qqMusicApi } from '@/api/qqmusic'

const result = await qqMusicApi.getQQLoginQr()
```

**返回值**:
```typescript
{
  img: string       // 二维码图片 URL
  ptqrtoken: string // 登录 token
  qrsig: string     // 二维码签名
}
```

---

#### checkQQLoginQr
检查登录状态

```javascript
import { qqMusicApi } from '@/api/qqmusic'

const result = await qqMusicApi.checkQQLoginQr(ptqrtoken, qrsig)
```

**参数**:
- `ptqrtoken` (string): 登录 token
- `qrsig` (string): 二维码签名

**返回值**:
```typescript
{
  isOk: boolean    // 是否登录成功
  refresh: boolean // 是否需要刷新二维码
}
```

**轮询策略**:
```javascript
// 每 2 秒检查一次
const interval = setInterval(async () => {
  const res = await qqMusicApi.checkQQLoginQr(ptqrtoken, qrsig)
  
  if (res.isOk) {
    // 登录成功
    clearInterval(interval)
  } else if (res.refresh) {
    // 二维码过期，重新获取
    loadQRCode()
  }
}, 2000)
```

---

#### checkQQMusicLogin
检查 QQ 音乐登录状态

```javascript
import { qqMusicApi } from '@/api/qqmusic'

const result = await qqMusicApi.checkQQMusicLogin()
```

**返回值**:
```typescript
{
  data: {
    cookie: string  // Cookie（存在表示已登录）
  }
}
```

---

## 📁 歌单相关 API

### 网易云音乐

#### getRecommendPlaylist
获取推荐歌单

```javascript
import { getRecommendPlaylist } from '@/api/playlist'

const result = await getRecommendPlaylist(10)
```

**参数**:
- `limit` (number): 数量（默认 10）

---

#### getPlaylistDetail
获取歌单详情

```javascript
import { getPlaylistDetail } from '@/api/playlist'

const result = await getPlaylistDetail(123456)
```

**参数**:
- `id` (number): 歌单 ID

---

#### getPlaylistTracks
获取歌单所有歌曲

```javascript
import { getPlaylistTracks } from '@/api/playlist'

const result = await getPlaylistTracks(123456, 100, 0)
```

**参数**:
- `id` (number): 歌单 ID
- `limit` (number): 数量（默认 100）
- `offset` (number): 偏移量（默认 0）

---

#### getRecommendSongs
获取每日推荐歌曲

```javascript
import { getRecommendSongs } from '@/api/playlist'

const result = await getRecommendSongs()
```

**注意**: 需要登录

---

## 📦 平台切换

### 使用示例

```javascript
import { searchStore } from '@/store/searchStore'

// 切换到 QQ 音乐
searchStore.setServer('qq')

// 切换到网易云音乐
searchStore.setServer('netease')

// 当前平台
console.log(searchStore.server) // 'qq' 或 'netease'
```

### Store 自动处理

```javascript
// searchStore 会根据 server 自动调用对应 API
await searchStore.search('周杰伦')

// 内部逻辑：
// if (server === 'qq') -> qqMusicApi.search()
// else -> search()
```

---

## ❌ 错误处理

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

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查参数格式和必填项 |
| 404 | 资源不存在 | 检查 ID 是否正确 |
| 401 | 未登录 | 需要登录的接口先登录 |
| 403 | 需要 VIP | 歌曲需要 VIP 权限 |
| 500 | 服务器错误 | 检查 API 服务是否运行 |

---

## 📝 类型定义

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
  server?: 'netease' | 'qq'  // 平台标识
  mediaId?: string           // QQ 音乐媒体 ID
}

interface Artist {
  id: number
  name: string
}

interface Album {
  id: number
  name: string
  picUrl?: string
  mid?: string  // QQ 音乐专辑 ID
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

### QQMusicSong 类型

```typescript
interface QQMusicSong {
  songmid: string       // 歌曲 ID
  strMediaMid: string   // 媒体 ID（播放必需）
  songname: string      // 歌曲名
  singer: Array<{
    name: string
    id: string
  }>
  album: {
    name: string
    mid: string
  }
  interval: number      // 时长（秒）
}
```

---

## 🔗 相关链接

- [网易云音乐 API 文档](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
- [QQ 音乐 API 文档](https://github.com/sansenjian/qq-music-api)
- [项目概述](./PROJECT.md)
- [快速开始](./GETTING_STARTED.md)

---

**文档版本**: v2.0  
**最后更新**: 2026-03-01
