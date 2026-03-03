# Request.js 使用指南

LUO Music 项目增强版 HTTP 请求模块，支持缓存、重试和请求取消功能。

## 目录

- [快速开始](#快速开始)
- [缓存控制](#缓存控制)
- [重试机制](#重试机制)
- [请求取消](#请求取消)
- [配置选项](#配置选项)
- [最佳实践](#最佳实践)
- [API 参考](#api-参考)

---

## 快速开始

### 基本使用

```javascript
import request from '@/api/request'

// GET 请求
const data = await request.get('/song/detail', { 
  params: { ids: '123' } 
})

// POST 请求
const result = await request.post('/playlist/create', {
  name: '我的歌单',
  privacy: 10
})
```

### 自动缓存

所有 GET 请求默认启用缓存 (5 分钟 TTL):

```javascript
// 第一次请求 - 从服务器获取
const data1 = await request.get('/song/detail', { 
  params: { ids: '123' } 
})

// 5 分钟内再次请求 - 从缓存返回
const data2 = await request.get('/song/detail', { 
  params: { ids: '123' } 
})
```

---

## 缓存控制

### 跳过缓存

```javascript
// 单个请求禁用缓存
const data = await request.get('/song/detail', {
  params: { ids: '123' },
  cache: false  // 或 skipCache: true
})
```

### 清空缓存

```javascript
import { clearCache } from '@/api/request'

// 清空所有缓存
clearCache()

// 清理过期缓存
import { cleanupExpiredCache } from '@/api/request'
cleanupExpiredCache()
```

### 查看缓存统计

```javascript
import { getCacheStats } from '@/api/request'

const stats = getCacheStats()
console.log(stats)
// {
//   total: 50,      // 总缓存数
//   valid: 45,      // 有效缓存
//   expired: 5,     // 过期缓存
//   maxSize: 100,   // 最大缓存数
//   ttl: 300000     // 缓存时间 (ms)
// }
```

### 预缓存数据

```javascript
import { prefetch } from '@/utils/requestCache'

// 预缓存歌曲详情
prefetch(
  { 
    method: 'get', 
    url: '/song/detail', 
    params: { ids: '123' } 
  },
  songData
)
```

---

## 重试机制

### 自动重试

所有请求默认启用重试 (最多 3 次，指数退避):

```javascript
// 网络错误时自动重试
const data = await request.get('/song/url', {
  params: { id: 123 }
})
// 失败后: 1s -> 2s -> 4s 后重试
```

### 自定义重试次数

```javascript
// 自定义重试次数
const data = await request.get('/song/url', {
  params: { id: 123 },
  retry: 5,              // 重试 5 次
  retryDelay: 2000,      // 初始延迟 2 秒
  retryMaxDelay: 20000   // 最大延迟 20 秒
})
```

### 禁用重试

```javascript
// 禁用重试
const data = await request.post('/login', {
  username: 'user',
  password: 'pass',
  retry: false  // 不重试
})
```

### 重试回调

```javascript
// 添加重试回调
const data = await request.get('/song/url', {
  params: { id: 123 },
  onRetry: (error, config, retryCount) => {
    console.log(`重试次数：${retryCount}`)
    // 可以更新 UI 显示重试状态
  }
})
```

---

## 请求取消

### 自动取消重复请求

相同请求会自动取消之前的未完成请求:

```javascript
// 快速多次调用只会执行最后一次
request.get('/search', { params: { keyword: 'a' } })
request.get('/search', { params: { keyword: 'ab' } })
request.get('/search', { params: { keyword: 'abc' } })
// 只有最后一次请求会执行
```

### 手动取消请求

```javascript
import { cancelAllRequests } from '@/api/request'

// 取消所有请求
cancelAllRequests()

// 取消指定 URL 的请求
import { cancelRequestsByUrl } from '@/api/request'
cancelRequestsByUrl('/search')  // 取消所有搜索请求
cancelRequestsByUrl('/song/.*') // 正则匹配
```

### 查看活跃请求

```javascript
import { getActiveRequestCount, getActiveRequestKeys } from '@/api/request'

// 获取活跃请求数量
const count = getActiveRequestCount()
console.log(`当前有 ${count} 个请求正在进行`)

// 获取所有活跃请求
const keys = getActiveRequestKeys()
console.log('活跃请求:', keys)
```

### 组件卸载时清理

```javascript
import { onBeforeUnmount } from 'vue'
import { cancelAllRequests } from '@/api/request'

// Vue 组件
export default {
  setup() {
    onBeforeUnmount(() => {
      cancelAllRequests()  // 组件卸载时取消所有请求
    })
  }
}
```

### 禁用自动取消

```javascript
// 禁用自动取消
const data = await request.get('/song/detail', {
  params: { ids: '123' },
  cancel: false  // 不自动取消相同请求
})
```

---

## 配置选项

### 全局配置

```javascript
import { updateConfig } from '@/utils/requestConfig'

// 更新缓存配置
updateConfig('cache', {
  enabled: true,
  ttl: 10 * 60 * 1000,    // 10 分钟
  max_size: 200           // 最多 200 条
})

// 更新重试配置
updateConfig('retry', {
  enabled: true,
  max_retries: 5,
  initial_delay: 1000,
  max_delay: 15000
})

// 更新取消配置
updateConfig('cancel', {
  enabled: true,
  auto_cancel: true
})
```

### 请求级别配置

```javascript
// 单个请求的配置优先级高于全局配置
const data = await request.get('/api/data', {
  cache: true,           // 启用缓存
  cacheTTL: 60000,       // 缓存 1 分钟
  retry: 3,              // 重试 3 次
  retryDelay: 1000,      // 初始延迟 1 秒
  cancel: true           // 启用取消
})
```

---

## 最佳实践

### 1. 搜索功能

```javascript
// 搜索输入防抖 + 自动取消重复请求
import { ref } from 'vue'
import { debounce } from '@/utils/performance'
import request from '@/api/request'

const searchResults = ref([])

const debouncedSearch = debounce(async (keyword) => {
  try {
    const data = await request.get('/cloudsearch', {
      params: { keywords: keyword }
    })
    searchResults.value = data.result.songs
  } catch (error) {
    console.error('搜索失败:', error)
  }
}, 300)

// 使用
function handleInput(e) {
  debouncedSearch(e.target.value)
}
```

### 2. 列表数据加载

```javascript
// 列表加载 + 缓存
import { onMounted } from 'vue'
import request from '@/api/request'

export default {
  setup() {
    const playlist = ref([])
    
    onMounted(async () => {
      try {
        // 第一次从服务器加载
        const data = await request.get('/playlist/detail', {
          params: { id: 123 },
          cache: true  // 启用缓存
        })
        playlist.value = data.playlist.tracks
        
        // 后续访问会从缓存读取 (5 分钟内)
      } catch (error) {
        console.error('加载失败:', error)
      }
    })
    
    return { playlist }
  }
}
```

### 3. 文件下载

```javascript
// 大文件下载 - 禁用缓存和重试
import request from '@/api/request'

async function downloadFile(url, filename) {
  try {
    const response = await request.get(url, {
      responseType: 'blob',
      cache: false,    // 不缓存
      retry: false,    // 不重试
      timeout: 60000   // 60 秒超时
    })
    
    const blob = new Blob([response])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  } catch (error) {
    console.error('下载失败:', error)
  }
}
```

### 4. 表单提交

```javascript
// 表单提交 - 禁用缓存和自动取消
import request from '@/api/request'

async function submitForm(data) {
  try {
    const result = await request.post('/playlist/create', data, {
      cache: false,    // 不缓存
      cancel: false,   // 不自动取消
      retry: false     // 不重试 (幂等性问题)
    })
    return result
  } catch (error) {
    throw error
  }
}
```

---

## API 参考

### 缓存相关

```javascript
// 获取缓存
getCache(config)

// 设置缓存
setCache(config, data)

// 清空缓存
clearCache()

// 清理过期缓存
cleanupExpiredCache()

// 获取缓存统计
getCacheStats()

// 删除指定 URL 的缓存
deleteCacheByUrl(url)

// 预缓存
prefetch(config, data)
```

### 请求取消相关

```javascript
// 取消未完成的请求
cancelPendingRequest(key)

// 取消所有请求
cancelAllRequests()

// 取消指定 URL 的请求
cancelRequestsByUrl(urlPattern)

// 获取活跃请求数量
getActiveRequestCount()

// 获取活跃请求键
getActiveRequestKeys()

// 检查请求是否活跃
isRequestActive(config)
```

### 重试相关

```javascript
// 检查是否应该重试
shouldRetry(error, retryCount, config)

// 计算重试延迟
calculateRetryDelay(retryCount, config)

// 获取重试统计
getRetryStats()

// 重置重试统计
resetRetryStats()
```

### 配置相关

```javascript
// 获取配置
getCacheConfig()
getRetryConfig()
getCancelConfig()

// 更新配置
updateConfig(category, newConfig)

// 重置配置
resetConfig(category)

// 导出配置
exportConfig()

// 导入配置
importConfig(config)
```

---

## 故障排除

### 问题 1: 缓存未命中

**原因**: URL 或参数不同

**解决**: 确保请求 URL 和参数一致

```javascript
// ❌ 不同的参数顺序会被视为不同请求
request.get('/api', { params: { a: 1, b: 2 } })
request.get('/api', { params: { b: 2, a: 1 } })

// ✅ 使用相同的参数顺序
request.get('/api', { params: { a: 1, b: 2 } })
request.get('/api', { params: { a: 1, b: 2 } })
```

### 问题 2: 请求被取消

**原因**: 相同请求重复调用

**解决**: 检查是否需要禁用自动取消

```javascript
// 如果确实需要并发相同请求
request.get('/api/data', { cancel: false })
```

### 问题 3: 重试过多

**原因**: 网络不稳定或服务器问题

**解决**: 减少重试次数或增加延迟

```javascript
request.get('/api/data', {
  retry: 2,              // 减少重试次数
  retryDelay: 2000,      // 增加初始延迟
  retryMaxDelay: 5000    // 限制最大延迟
})
```

---

## 性能提示

1. **合理使用缓存**: 对不常变化的数据启用缓存
2. **避免重复请求**: 使用防抖和请求取消
3. **优化重试策略**: 根据业务场景调整重试参数
4. **定期清理缓存**: 使用 `cleanupExpiredCache()` 清理过期缓存

---

**更新时间**: 2026-03-02  
**版本**: 2.0.0
