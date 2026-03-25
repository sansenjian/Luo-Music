# 硬编码常量重构总结

## 已创建的常量文件

### 1. `src/constants/audio.ts`

音频质量相关常量：

- `AudioQuality` - 音质等级枚举
- `AUDIO_BITRATE_MAP` - 音质等级对应的比特率映射
- `DEFAULT_AUDIO_BITRATE` - 默认比特率 (128000)
- `getBitrateByLevel()` - 根据音质等级获取比特率的工具函数

### 2. `src/constants/http.ts`

HTTP 请求相关常量：

- `HTTP_COOKIE_CACHE_TTL` - Cookie 缓存有效期 (5000ms)
- `HTTP_DEFAULT_TIMEOUT` - 默认超时时间 (30000ms)
- `HTTP_DEFAULT_RETRY_COUNT` - 默认重试次数 (3)
- `HTTP_DEFAULT_RETRY_DELAY` - 默认重试延迟 (1000ms)
- `NETEASE_API_PORT` - 网易云 API 端口 (14532)
- `QQ_API_PORT` - QQ 音乐 API 端口 (3200)
- `DEV_API_SERVER` - 开发环境 API 服务器地址
- `QQ_API_SERVER` - QQ 音乐 API 服务器地址
- `HttpMethod` - HTTP 方法枚举

### 3. `src/constants/lyric.ts`

歌词滚动相关常量：

- `USER_SCROLL_IDLE_DELAY` - 用户滚动后恢复自动滚动的延迟 (900ms)
- `USER_SCROLL_END_DEBOUNCE` - 用户滚动结束防抖时间 (120ms)
- `PROGRAMMATIC_SCROLL_GUARD` - 程序化滚动保护阈值 (380ms)
- `DEFAULT_LYRIC_UPDATE_INTERVAL` - 默认刷新间隔 (100ms)

### 4. `src/platform/music/netease.constants.ts`

网易云音乐 API 常量：

- `NETEASE_SEARCH_TYPES` - 搜索类型枚举
- `NETEASE_SEARCH_TYPE_MAP` - 搜索类型字符串到 API 数值的映射
- `DEFAULT_NETEASE_SEARCH_TYPE` - 默认搜索类型
- `getNeteaseSearchType()` - 根据搜索类型字符串获取 API 数值的工具函数

### 5. `src/constants/index.ts`

常量统一导出文件

### 6. `electron/shared/protocol/cache.ts` (更新)

新增 API 端口配置：

- `NETEASE_API_PORT` - 网易云 API 端口 (14532)
- `QQ_API_PORT` - QQ 音乐 API 端口 (3200)

## 已修复的文件

### 主代码文件

| 文件                                    | 修复内容                                      |
| --------------------------------------- | --------------------------------------------- |
| `electron/ipc/handlers/api.handler.ts`  | 替换网易云搜索类型硬编码、默认比特率硬编码    |
| `src/api/song.ts`                       | 替换比特率映射表硬编码                        |
| `src/platform/music/netease.ts`         | 替换比特率映射表硬编码                        |
| `src/composables/useLyricAutoScroll.ts` | 替换时间常量硬编码                            |
| `src/utils/http/index.ts`               | 替换 Cookie 缓存 TTL、超时、重试配置硬编码    |
| `src/utils/http/requestConfig.ts`       | 替换重试次数、延迟、超时硬编码                |
| `src/api/qqmusic.ts`                    | 替换 Cookie 缓存 TTL、QQ API 服务器地址硬编码 |
| `src/services/apiService.ts`            | 替换默认超时硬编码                            |
| `electron/ipc/utils/gatewayCache.ts`    | 替换重试配置硬编码                            |
| `electron/main/index.ts`                | 替换服务端口硬编码、IPC 超时硬编码            |
| `src/services/configService.ts`         | 替换端口配置硬编码                            |

## 重构效果

### 修复前

```typescript
// api.handler.ts
function mapNeteaseSearchType(type?: string): number {
  switch (type) {
    case 'artist':
      return 100
    case 'album':
      return 10
    case 'playlist':
      return 1000
    case 'user':
      return 1002
    default:
      return 1
  }
}

function mapQualityToBitrate(quality?: number): number {
  return quality || 128000 // 硬编码
}
```

### 修复后

```typescript
import { getNeteaseSearchType } from '@/platform/music/netease.constants'
import { getBitrateByLevel, DEFAULT_AUDIO_BITRATE } from '@/constants/audio'

function mapNeteaseSearchType(type?: string): number {
  return getNeteaseSearchType(type)
}

function mapQualityToBitrate(quality?: number): number {
  return quality || DEFAULT_AUDIO_BITRATE
}
```

## 使用指南

### 导入常量

```typescript
// 导入单个常量
import { DEFAULT_AUDIO_BITRATE } from '@/constants/audio'

// 导入所有音频相关常量
import * as audio from '@/constants/audio'

// 使用工具函数
import { getBitrateByLevel } from '@/constants/audio'
const br = getBitrateByLevel('higher') // 192000
```

### 添加新常量

1. 在对应的常量文件中添加定义
2. 添加 JSDoc 注释说明用途
3. 在 `index.ts` 中导出（如果需要）
4. 在业务代码中使用新常量替换硬编码

## 注意事项

1. **不要修改常量的值** - 常量的值经过测试验证，修改可能影响功能
2. **使用工具函数** - 优先使用提供的工具函数而非直接访问映射表
3. **添加文档** - 新增常量时必须添加 JSDoc 注释
4. **避免循环依赖** - 常量文件不应该导入业务代码

## 剩余工作

以下类型错误与硬编码无关，是原有代码问题：

- `src/utils/http/electronIpcRequest.ts` - FormData 和类型断言问题
- `src/views/UserCenter.vue` - 索引签名问题
- 测试文件中的类型不匹配问题（多处）

---

## 编码问题修复 (2026-03-21)

### 修复的文件

| 文件                        | 修复内容                                                     |
| --------------------------- | ------------------------------------------------------------ |
| `electron/sandbox/index.ts` | 修复 10+ 处中文注释乱码，如“核心”“服务”等关键注释            |
| `electron/ipc/index.ts`     | 修复“中间件”“处理器”等注释与说明文字                         |
| `electron/ipc/types.ts`     | 全面修复文件头、章节标记、注释中的乱码，例如“通道类型”等术语 |
| `src/api/qqmusic.ts`        | 修复控制台警告信息中的乱码                                   |

### 乱码模式识别

这些乱码是由于 UTF-8 编码的中文注释被错误地以其他编码（如 GBK/GB2312）保存或读取导致的。

常见受影响词汇：

- 核心
- 服务
- 通道
- 类型
- 窗口
- 播放
- 歌词
- 中间件
- 处理器
- 网络

### 验证结果

- 类型检查：通过
- 测试：70 个测试文件，468 个测试全部通过
- 无剩余乱码字符
