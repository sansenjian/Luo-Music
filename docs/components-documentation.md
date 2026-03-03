# 组件文档

## 📋 概述

本文档描述了 LUO Music 项目的 Vue 3 组件。所有组件都使用 **Composition API** 和 `<script setup>` 语法。

### 技术栈
- **Vue 3.5+** - Composition API
- **Pinia 3.0+** - 状态管理
- **Naive UI 2.43+** - UI 组件库
- **Anime.js 4.0+** - 动画效果

---

## 🎵 核心组件

### Player 组件

播放器核心组件，支持完整模式和紧凑模式。

**文件位置**: `src/components/Player.vue`

#### 基本用法

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

#### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| compact | boolean | 否 | false | 是否为紧凑模式 |
| loading | boolean | 否 | false | 是否显示加载状态 |

#### 功能特性

- ✅ **播放控制**: 播放/暂停、上一首、下一首
- ✅ **进度控制**: 点击跳转、拖动调整
- ✅ **音量控制**: 0-100% 范围调节
- ✅ **播放模式**: 顺序播放、列表循环、单曲循环、随机播放
- ✅ **歌曲信息**: 封面、歌名、歌手、专辑
- ✅ **动画效果**: 按钮点击动画、封面旋转

#### 依赖

- `playerStore` - 播放器状态管理
- `useAnimations` - 动画效果
- `animejs` - 动画库

#### 样式说明

```vue
<style scoped>
.player-container {
  /* 完整模式样式 */
}

.player-compact {
  /* 紧凑模式样式 */
}
</style>
```

---

### Lyric 组件

歌词展示组件，支持原文、翻译、罗马音多层显示。

**文件位置**: `src/components/Lyric.vue`

#### 基本用法

```vue
<template>
  <Lyric />
</template>

<script setup>
import Lyric from '@/components/Lyric.vue'
</script>
```

#### 功能特性

- ✅ **歌词解析**: 支持 LRC 格式
- ✅ **多层显示**: 原文、翻译、罗马音
- ✅ **自动滚动**: 跟随播放进度自动滚动
- ✅ **点击跳转**: 点击歌词跳转到对应时间
- ✅ **高亮显示**: 当前播放行高亮
- ✅ **流畅动画**: 平滑滚动效果

#### 依赖

- `playerStore` - 歌词数据和播放状态
- `animejs` - 滚动动画

#### 状态说明

| 状态 | 说明 |
|------|------|
| 无歌词 | 显示 "暂无歌词" |
| 有歌词 | 显示歌词列表，当前行高亮 |
| 用户滚动 | 暂停自动滚动 2 秒 |
| 加载失败 | 显示 "歌词加载失败" |

#### 歌词格式

```typescript
interface LyricLine {
  time: number      // 时间（秒）
  lyric: string     // 原文歌词
  tlyric?: string   // 翻译歌词
  rlyric?: string   // 罗马音歌词
}
```

---

### Playlist 组件

播放列表组件，展示当前播放列表。

**文件位置**: `src/components/Playlist.vue`

#### 基本用法

```vue
<template>
  <Playlist />
</template>

<script setup>
import Playlist from '@/components/Playlist.vue'
</script>
```

#### 功能特性

- ✅ **列表展示**: 展示当前播放列表
- ✅ **歌曲操作**: 播放、删除歌曲
- ✅ **当前高亮**: 正在播放的歌曲高亮
- ✅ **专辑封面**: 显示歌曲专辑封面
- ✅ **平台标识**: 显示歌曲来源（网易/QQ）
- ✅ **空状态**: 列表为空时显示提示
- ✅ **滚动支持**: 长列表滚动

#### 依赖

- `playerStore` - 播放列表数据
- `toastStore` - 操作提示

#### 列表项结构

```typescript
interface Song {
  id: number
  name: string
  artist: string
  album: string
  cover?: string
  duration: number
  server: 'netease' | 'qq'
  url?: string
}
```

---

## 🔍 搜索组件

### SearchInput 组件

搜索输入组件，支持搜索建议和热搜。

**文件位置**: `src/components/SearchInput.vue`

#### 基本用法

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

#### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| modelValue | string | 否 | '' | 搜索关键词 (v-model) |
| placeholder | string | 否 | '搜索音乐...' | 占位符文本 |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:modelValue | string | 输入值变化 |
| search | string | 触发搜索 |
| clear | - | 清除搜索 |

#### 功能特性

- ✅ **输入搜索**: 支持回车触发搜索
- ✅ **搜索建议**: 输入时显示建议
- ✅ **热搜列表**: 展示热门搜索词
- ✅ **清除按钮**: 一键清除输入
- ✅ **防抖处理**: 避免频繁请求

---

### PlatformSelector 组件

平台选择组件，切换音乐源。

**文件位置**: `src/components/PlatformSelector.vue`（Home.vue 内）

#### 基本用法

```vue
<template>
  <div class="platform-selector" @click="toggleSelect">
    <span>{{ selectedServerLabel }}</span>
    <div v-if="showSelect" class="platform-dropdown">
      <div 
        v-for="server in servers" 
        :key="server.value"
        @click="selectServer(server.value)"
      >
        {{ server.label }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSearchStore } from '@/store/searchStore'

const searchStore = useSearchStore()
const showSelect = ref(false)

const servers = [
  { label: '网易云', value: 'netease' },
  { label: 'QQ 音乐', value: 'qq' }
]

const selectedServerLabel = computed(() => {
  const server = servers.find(s => s.value === searchStore.server)
  return server?.label || '网易云'
})

const toggleSelect = () => {
  showSelect.value = !showSelect.value
}

const selectServer = (value) => {
  searchStore.setServer(value)
  showSelect.value = false
}
</script>
```

#### 功能特性

- ✅ **平台切换**: 网易云音乐 / QQ 音乐
- ✅ **自定义下拉**: 替代原生 select
- ✅ **样式统一**: 与整体设计风格一致
- ✅ **点击关闭**: 选择后自动关闭

---

## 👤 用户组件

### UserAvatar 组件

用户头像和菜单组件。

**文件位置**: `src/components/UserAvatar.vue`

#### 基本用法

```vue
<template>
  <div class="user-avatar" @click="toggleDropdown">
    <img src="/avatar.png" alt="用户头像" />
    <div v-if="showDropdown" class="user-menu">
      <div class="user-info">
        <span>用户名</span>
      </div>
      <div class="menu-item">退出登录</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showDropdown = ref(false)

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}
</script>
```

#### 功能特性

- ✅ **头像显示**: 展示用户头像
- ✅ **下拉菜单**: 用户信息和操作
- ✅ **登录状态**: 显示 QQ 音乐登录状态
- ✅ **退出登录**: 清除登录信息
- ✅ **点击关闭**: 点击外部关闭菜单

---

### QQLoginModal 组件

QQ 音乐扫码登录组件。

**文件位置**: `src/components/QQLoginModal.vue`

#### 基本用法

```vue
<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="login-modal">
      <div v-if="loading">加载中...</div>
      <img v-else :src="qrCodeImg" alt="登录二维码" />
      <p>请使用 QQ 音乐扫码登录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { qqMusicApi } from '@/api/qqmusic'
import { toastStore } from '@/store/toastStore'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:modelValue', 'loginSuccess'])

const qrCodeImg = ref('')
const ptqrtoken = ref('')
const qrsig = ref('')
const loading = ref(false)
let checkInterval = null

async function loadQRCode() {
  loading.value = true
  try {
    const res = await qqMusicApi.getQQLoginQr()
    const data = res.body || res
    if (data && data.img) {
      qrCodeImg.value = data.img
      ptqrtoken.value = data.ptqrtoken
      qrsig.value = data.qrsig
      startCheck()
    }
  } catch (error) {
    toastStore.error('获取二维码失败：' + error.message)
  } finally {
    loading.value = false
  }
}

function startCheck() {
  checkInterval = setInterval(async () => {
    const res = await qqMusicApi.checkQQLoginQr(ptqrtoken.value, qrsig.value)
    if (res && res.isOk) {
      toastStore.success('登录成功！')
      stopCheck()
      emit('loginSuccess')
      emit('update:modelValue', false)
    } else if (res && res.refresh) {
      loadQRCode() // 自动刷新过期二维码
    }
  }, 2000)
}

function stopCheck() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

function close() {
  stopCheck()
  emit('update:modelValue', false)
}

onMounted(() => {
  loadQRCode()
})
</script>
```

#### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| visible | boolean | 是 | - | 是否显示弹窗 |

#### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:modelValue | boolean | 关闭弹窗 |
| loginSuccess | - | 登录成功 |

#### 功能特性

- ✅ **二维码加载**: 自动获取登录二维码
- ✅ **状态轮询**: 每 2 秒检查登录状态
- ✅ **自动刷新**: 二维码过期自动刷新
- ✅ **登录成功**: 触发回调并关闭弹窗
- ✅ **Cookie 保存**: 登录状态持久化

---

## 📦 通用组件

### Toast 组件

消息提示组件，用于显示操作反馈。

**文件位置**: `src/components/Toast.vue`

#### 基本用法

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

#### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| visible | boolean | 是 | - | 是否显示 |
| message | string | 是 | - | 提示消息 |
| type | string | 否 | 'info' | 提示类型：success, error, warning, info |
| duration | number | 否 | 3000 | 显示时长 (ms) |

#### Events

| 事件名 | 说明 |
|--------|------|
| close | 关闭提示 |

#### Store 使用方式

```javascript
import { toastStore } from '@/store/toastStore'

// 成功提示
toastStore.success('操作成功！')

// 错误提示
toastStore.error('操作失败！')

// 警告提示
toastStore.warning('请注意！')

// 信息提示
toastStore.info('提示信息')
```

---

### PageTransition 组件

页面过渡动画组件。

**文件位置**: `src/components/PageTransition.vue`

#### 基本用法

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

#### Props

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| name | string | 否 | 'fade' | 过渡动画名称 |
| mode | string | 否 | 'out-in' | 过渡模式 |

#### 支持的动画

- `fade` - 淡入淡出
- `slide` - 滑动
- `scale` - 缩放

#### CSS 示例

```css
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

---

## 🎨 组件设计原则

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

### 6. 组合式 API
使用 `<script setup>` 语法，代码更简洁。

---

## 📝 最佳实践

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
import { toastStore } from '@/store/toastStore'

const handleError = (error) => {
  toastStore.error(error.message)
}
</script>
```

### 组件通信

```vue
<!-- 父组件 -->
<template>
  <ChildComponent 
    :data="parentData"
    @update="handleUpdate"
  />
</template>

<script setup>
import { ref } from 'vue'

const parentData = ref(null)

const handleUpdate = (newData) => {
  parentData.value = newData
}
</script>
```

---

## 🔗 相关链接

- [Vue 3 组件指南](https://vuejs.org/guide/essentials/component-basics.html)
- [Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Naive UI 组件库](https://www.naiveui.com/)

---

**文档版本**: v2.0  
**最后更新**: 2026-03-01
