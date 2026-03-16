# Sandbox 服务代理层使用指南

## 概述

Sandbox 服务代理层提供了渲染进程与 Electron 主进程之间的安全通信层。通过统一的 API，渲染进程可以安全地访问主进程的功能，包括 IPC 通信、日志、配置、API 请求、窗口控制和播放器控制。

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    渲染进程 (Renderer)                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           window.services (服务代理层)               │ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │ │
│  │  │ IPC  │ │ Log  │ │Config│ │ API  │ │ Window   │  │ │
│  │  │Proxy │ │Proxy │ │Proxy │ │Proxy │ │ Proxy    │  │ │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│                         │                                 │
│                   ContextBridge                           │
│                         │                                 │
├─────────────────────────┼─────────────────────────────────┤
│                   Electron Sandbox                        │
│                         │                                 │
│                   IPC Channels                            │
│                         │                                 │
├─────────────────────────┼─────────────────────────────────┤
│                    主进程 (Main)                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              IPC 处理器 (ipc/index.ts)               │ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │ │
│  │  │Window│ │Cache │ │Player│ │Service│ │ Lyric    │  │ │
│  │  │Handler│ │Handler│ │Handler│ │Handler│ │ Handler  │  │ │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 基本使用

```typescript
// 在 Vue 组件中使用
import { defineComponent } from 'vue'

export default defineComponent({
  async mounted() {
    // 获取播放状态
    const state = await window.services.player.getState()
    console.log('当前播放状态:', state)

    // 搜索歌曲
    const result = await window.services.api.search('周杰伦')
    console.log('搜索结果:', result)
  }
})
```

### 2. 日志服务

```typescript
// 创建模块日志器
const logger = window.services.createLogger('PlayerComponent')

// 记录日志
logger.info('组件已初始化')
logger.debug('调试信息', { data: { volume: 80 } })
logger.warn('警告信息')
logger.error('错误信息', { error: 'Failed to load song' })
logger.errorWithStack(new Error('Network error'), 'API Request')
```

### 3. 配置服务

```typescript
// 获取配置
const theme = await window.services.config.get('theme')
const allConfig = await window.services.config.getAll()

// 设置配置
await window.services.config.set('theme', 'dark')
await window.services.config.set('defaultVolume', 80)

// 监听配置变化
const unsubscribe = window.services.config.onConfigChange((event) => {
  console.log(`配置 ${event.key} 从 ${event.oldValue} 变为 ${event.newValue}`)
})

// 取消监听
unsubscribe()
```

### 4. API 服务

```typescript
// 搜索
const searchResult = await window.services.api.search(
  '周杰伦',      // 关键词
  'song',        // 类型：song | artist | album | playlist | user
  'qq',          // 平台：netease | qq
  1,             // 页码
  30             // 每页数量
)

// 获取歌曲 URL
const url = await window.services.api.getSongUrl({
  id: '123456',
  platform: 'netease'
})

// 获取歌词
const lyric = await window.services.api.getLyric({
  id: '123456',
  platform: 'netease'
})

// 获取详情
const songDetail = await window.services.api.getSongDetail({
  id: '123456',
  platform: 'netease'
})

const playlistDetail = await window.services.api.getPlaylistDetail(
  'playlist-123',
  'qq'
)
```

### 5. 窗口控制

```typescript
// 基本控制
window.services.window.minimize()
window.services.window.toggleMaximize()
window.services.window.close()

// 状态查询
const state = await window.services.window.getState()
if (await window.services.window.isMaximized()) {
  console.log('窗口已最大化')
}

// 桌面歌词
await window.services.window.toggleDesktopLyric(true)
await window.services.window.setDesktopLyricOnTop(true)
await window.services.window.lockDesktopLyric(false)
```

### 6. 播放器控制

```typescript
// 播放控制
await window.services.player.play()
await window.services.player.pause()
await window.services.player.toggle()

// 播放歌曲
await window.services.player.playSong({
  id: '123',
  name: '歌曲名',
  artist: '歌手',
  album: '专辑',
  cover: 'https://...',
  platform: 'netease'
})

// 或通过 ID 播放
await window.services.player.playSongById('123', 'qq')

// 切歌
await window.services.player.skipToPrevious()
await window.services.player.skipToNext()

// 进度控制
await window.services.player.seekTo(120) // 跳转到 120 秒

// 音量控制
await window.services.player.setVolume(80)
await window.services.player.toggleMute()

// 播放模式
await window.services.player.setPlayMode('loop')
await window.services.player.togglePlayMode()

// 获取状态
const state = await window.services.player.getState()
const currentSong = await window.services.player.getCurrentSong()
const playlist = await window.services.player.getPlaylist()

// 歌词
const lyrics = await window.services.player.getLyric('123', 'netease')

// 事件监听
const unsubscribePlayState = window.services.player.onPlayStateChange((data) => {
  console.log('播放状态变化:', data.isPlaying, data.currentTime)
})

const unsubscribeSongChange = window.services.player.onSongChange((data) => {
  console.log('歌曲变化:', data.song, data.index)
})

const unsubscribeLyricUpdate = window.services.player.onLyricUpdate((data) => {
  console.log('歌词更新:', data.index, data.line)
})

const unsubscribeError = window.services.player.onPlayError((data) => {
  console.error('播放错误:', data.error, data.song)
})
```

## 完整示例：Vue 组件

```vue
<template>
  <div class="player-component">
    <div v-if="currentSong">
      <h3>{{ currentSong.name }}</h3>
      <p>{{ currentSong.artist }}</p>
      <button @click="togglePlay">
        {{ isPlaying ? '暂停' : '播放' }}
      </button>
      <button @click="skipToNext">下一首</button>
      <input
        type="range"
        :value="currentTime"
        :max="duration"
        @input="seekTo"
      />
      <span>{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
    </div>
    <div class="lyrics">
      <div
        v-for="(line, index) in lyrics"
        :key="index"
        :class="{ active: index === activeLyricIndex }"
      >
        {{ line.text }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const currentSong = ref<typeof window.services.player.getState>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const lyrics = ref([])
const activeLyricIndex = ref(-1)

let unsubscribePlayState: (() => void) | null = null
let unsubscribeSongChange: (() => void) | null = null
let unsubscribeLyricUpdate: (() => void) | null = null

async function loadState() {
  const state = await window.services.player.getState()
  currentSong.value = state.currentSong
  isPlaying.value = state.isPlaying
  currentTime.value = state.currentTime
  duration.value = state.duration
}

async function togglePlay() {
  await window.services.player.toggle()
}

async function skipToNext() {
  await window.services.player.skipToNext()
}

async function seekTo(event: Event) {
  const time = (event.target as HTMLInputElement).valueAsNumber
  await window.services.player.seekTo(time)
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

onMounted(async () => {
  await loadState()

  // 监听播放状态
  unsubscribePlayState = window.services.player.onPlayStateChange((data) => {
    isPlaying.value = data.isPlaying
    currentTime.value = data.currentTime
  })

  // 监听歌曲变化
  unsubscribeSongChange = window.services.player.onSongChange(async (data) => {
    currentSong.value = data.song
    if (data.song) {
      lyrics.value = await window.services.player.getLyric(data.song.id)
    }
  })

  // 监听歌词更新
  unsubscribeLyricUpdate = window.services.player.onLyricUpdate((data) => {
    activeLyricIndex.value = data.index
  })
})

onUnmounted(() => {
  unsubscribePlayState?.()
  unsubscribeSongChange?.()
  unsubscribeLyricUpdate?.()
})
</script>
```

## 类型定义

所有服务代理都提供完整的 TypeScript 类型定义：

- `ServiceAPI` - 服务代理总接口
- `AppConfig` - 配置项类型
- `Song` - 歌曲信息类型
- `PlayerState` - 播放状态类型
- `LyricLine` - 歌词行类型
- `WindowState` - 窗口状态类型
- `SearchResult` - 搜索结果类型

## 向后兼容

旧的 `window.electronAPI` 仍然可用，但推荐迁移到新的 `window.services` API：

```typescript
// 旧的方式（仍然可用）
window.electronAPI.minimizeWindow()
window.electronAPI.on('player:track-changed', callback)

// 新的方式（推荐）
window.services.window.minimize()
window.services.player.onSongChange(callback)
```

## 验证工具

Sandbox 服务代理层内置了参数验证：

```typescript
import { Validator } from '@electron/sandbox/services'

// 字符串验证
Validator.string(keyword, 'keyword').min(1).max(100).validate()

// 数字验证
Validator.number(volume, 'volume').min(0).max(100).validate()

// 枚举验证
Validator.enum(platform, ['netease', 'qq'], 'platform')
```

## 安全特性

1. **通道验证** - 所有 IPC 通道名称都经过白名单验证
2. **参数清理** - 字符串参数自动清理 XSS 风险
3. **类型安全** - 完整的 TypeScript 类型定义
4. **错误处理** - 统一的错误处理机制
