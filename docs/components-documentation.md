# 组件文档

## 概述

本文档描述了 Luo Music 项目的 Vue 3 组件。所有组件都使用 Composition API 和 `<script setup>` 语法。

## Player 组件

播放器核心组件，支持完整模式和紧凑模式。

### 基本用法

```vue
<template>
  <!-- 完整模式 -->
  <Player :compact="false" :loading="false" />
  
  <!-- 紧凑模式 -->
  <Player compact :loading="false" />
</template>

<script setup>
import Player from '@/components/Player.vue'
</script>
```

### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| compact | boolean | 否 | false | 是否为紧凑模式 |
| loading | boolean | 否 | false | 是否显示加载状态 |

### 功能特性

- **播放控制**: 播放/暂停、上一首、下一首
- **进度控制**: 点击跳转、拖动调整
- **音量控制**: 0-100% 范围调节
- **播放模式**: 顺序播放、列表循环、单曲循环、随机播放
- **歌曲信息**: 封面、歌名、歌手、专辑

### 依赖

- `playerStore` - 播放器状态管理
- `useAnimations` - 动画效果

---

## Lyric 组件

歌词展示组件，支持原文、翻译、罗马音多层显示。

### 基本用法

```vue
<template>
  <Lyric />
</template>

<script setup>
import Lyric from '@/components/Lyric.vue'
</script>
```

### 功能特性

- **歌词解析**: 支持 LRC 格式
- **多层显示**: 原文、翻译、罗马音
- **自动滚动**: 跟随播放进度自动滚动
- **点击跳转**: 点击歌词跳转到对应时间
- **高亮显示**: 当前播放行高亮

### 依赖

- `playerStore` - 歌词数据和播放状态
- `animejs` - 滚动动画

### 状态说明

| 状态 | 说明 |
|------|------|
| 无歌词 | 显示 "Search and play a track to view lyrics" |
| 有歌词 | 显示歌词列表，当前行高亮 |
| 用户滚动 | 暂停自动滚动 2 秒 |

---

## Playlist 组件

播放列表组件，展示当前播放列表。

### 基本用法

```vue
<template>
  <Playlist />
</template>

<script setup>
import Playlist from '@/components/Playlist.vue'
</script>
```

### 功能特性

- **列表展示**: 展示当前播放列表
- **歌曲操作**: 播放、删除歌曲
- **空状态**: 列表为空时显示提示
- **滚动支持**: 长列表滚动

### 依赖

- `playerStore` - 播放列表数据

---

## SearchInput 组件

搜索输入组件，支持搜索建议和热搜。

### 基本用法

```vue
<template>
  <SearchInput 
    v-model="keywords"
    @search="handleSearch"
    @clear="handleClear"
  />
</template>

<script setup>
import { ref } from 'vue'
import SearchInput from '@/components/SearchInput.vue'

const keywords = ref('')

const handleSearch = (value) => {
  console.log('搜索:', value)
}

const handleClear = () => {
  console.log('清除搜索')
}
</script>
```

### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| modelValue | string | 否 | '' | 搜索关键词 (v-model) |
| placeholder | string | 否 | '搜索音乐...' | 占位符文本 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:modelValue | string | 输入值变化 |
| search | string | 触发搜索 |
| clear | - | 清除搜索 |

### 功能特性

- **输入搜索**: 支持回车触发搜索
- **搜索建议**: 输入时显示建议
- **热搜列表**: 展示热门搜索词
- **清除按钮**: 一键清除输入

---

## Toast 组件

消息提示组件，用于显示操作反馈。

### 基本用法

```vue
<template>
  <Toast 
    :visible="visible"
    :message="message"
    :type="type"
    @close="visible = false"
  />
</template>

<script setup>
import { ref } from 'vue'
import Toast from '@/components/Toast.vue'

const visible = ref(false)
const message = ref('操作成功')
const type = ref('success') // success, error, warning, info
</script>
```

### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| visible | boolean | 是 | - | 是否显示 |
| message | string | 是 | - | 提示消息 |
| type | string | 否 | 'info' | 提示类型: success, error, warning, info |
| duration | number | 否 | 3000 | 显示时长 (ms) |

### Events

| 事件名 | 说明 |
|--------|------|
| close | 关闭提示 |

---

## PageTransition 组件

页面过渡动画组件。

### 基本用法

```vue
<template>
  <PageTransition>
    <router-view />
  </PageTransition>
</template>

<script setup>
import PageTransition from '@/components/PageTransition.vue'
</script>
```

### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| name | string | 否 | 'fade' | 过渡动画名称 |
| mode | string | 否 | 'out-in' | 过渡模式 |

### 支持的动画

- `fade` - 淡入淡出
- `slide` - 滑动
- `scale` - 缩放

---

## 组件设计原则

### 1. 单一职责
每个组件只负责一个明确的功能，避免功能混杂。

### 2. Props 优先
通过 Props 传递数据，减少组件间的直接依赖。

### 3. 事件通信
使用 Events 向父组件传递状态变化。

### 4. 状态管理
复杂状态使用 Pinia Store 管理，避免 prop drilling。

### 5. 样式隔离
组件样式使用 scoped，避免全局污染。

## 最佳实践

### 使用 Store

```vue
<script setup>
import { usePlayerStore } from '@/store/playerStore'

const playerStore = usePlayerStore()

// 读取状态
const isPlaying = computed(() => playerStore.playing)

// 调用方法
const togglePlay = () => {
  playerStore.togglePlay()
}
</script>
```

### 使用动画

```vue
<script setup>
import { animateButtonClick } from '@/composables/useAnimations'

const handleClick = (event) => {
  animateButtonClick(event.target)
  // 执行业务逻辑
}
</script>
```

### 错误处理

```vue
<script setup>
import { ElMessage } from 'element-plus'

const handleError = (error) => {
  ElMessage.error(error.message)
}
</script>
```
