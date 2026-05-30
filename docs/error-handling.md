# 错误处理文档

Luo Music 使用统一的错误处理机制来管理应用程序中的异常情况。本系统基于 `AppError` 类、`ErrorCode` 枚举和 `ErrorCenter` 事件中心构建。

## 核心概念

### 1. ErrorCode (错误码)

错误码用于标识错误的类型，采用 4 位数字表示，按功能模块划分区间：

| 区间          | 模块     | 描述                             |
| :------------ | :------- | :------------------------------- |
| **1000-1999** | 网络层   | 网络连接、API 请求超时等         |
| **2000-2999** | 内容层   | 歌曲版权、歌单不存在、歌词解析等 |
| **3000-3999** | 播放器层 | 音频解码、播放上下文等错误       |
| **4000-4999** | 系统层   | 主进程崩溃、存储、缓存、配置等   |
| **5000-5999** | 认证层   | 登录失败、会话过期、权限不足等   |
| **6000-6999** | 下载层   | 下载失败、下载中断等             |
| **9999**      | 未知错误 | 兜底错误码                       |

#### 详细定义

```typescript
enum ErrorCode {
  // 网络层 (1xxx)
  NETWORK_OFFLINE = 1001,
  API_TIMEOUT = 1002,
  API_RATE_LIMIT = 1003,
  API_REQUEST_FAILED = 1004,
  SERVICE_UNAVAILABLE = 1005,

  // 内容层 (2xxx)
  SONG_NO_COPYRIGHT = 2001,
  SONG_URL_EXPIRED = 2002,
  PLAYLIST_NOT_FOUND = 2003,
  LYRIC_NOT_FOUND = 2004,
  LYRIC_PARSE_ERROR = 2005,

  // 播放器层 (3xxx)
  AUDIO_DECODE_FAILED = 3001,
  AUDIO_CONTEXT_SUSPENDED = 3002,

  // 系统层 (4xxx)
  MAIN_PROCESS_CRASH = 4001,
  STORAGE_FULL = 4002,
  CACHE_READ_ERROR = 4003,
  CACHE_WRITE_ERROR = 4004,
  CACHE_CORRUPTED = 4005,
  CONFIG_LOAD_FAILED = 4006,
  CONFIG_INVALID = 4007,

  // 认证层 (5xxx)
  LOGIN_FAILED = 5001,
  SESSION_EXPIRED = 5002,
  TOKEN_REFRESH_FAILED = 5003,
  PERMISSION_DENIED = 5004,

  // 下载层 (6xxx)
  DOWNLOAD_FAILED = 6001,
  DOWNLOAD_INTERRUPTED = 6002,

  UNKNOWN_ERROR = 9999
}
```

### 2. AppError (应用错误类)

`AppError` 是应用内统一的错误对象，继承自原生 `Error`。

**属性：**

- `code`: `ErrorCode` - 错误码
- `message`: `string` - 错误详情（用于调试）
- `recoverable`: `boolean` - 是否可自动恢复（默认为 `true`）
- `data`: `any` - 附加数据（如出错的 `songId`）

**方法：**

- `getUserMessage()`: 返回面向用户的友好提示信息。

### 3. ErrorCenter (错误中心)

`ErrorCenter` 是一个单例对象，负责错误的统一分发和处理。

**功能：**

- **注册处理器**：监听特定错误码或全局错误。
- **错误分发**：接收错误并执行处理链。
- **自动包装**：将非 `AppError` 类型的错误自动包装为 `UNKNOWN_ERROR`。
- **错误上报**：对于不可恢复的错误 (`recoverable: false`)，自动上报到主进程。

## 使用指南

### 抛出错误

推荐使用 `Errors` 工具对象快速创建错误，或者直接实例化 `AppError`。

```typescript
import { errorCenter, Errors, AppError, ErrorCode } from '@/utils'

// 方式 1: 使用预定义工厂方法
if (!hasCopyright) {
  throw Errors.noCopyright(songId)
}

// 方式 2: 直接实例化
throw new AppError(ErrorCode.NETWORK_OFFLINE, 'Network is down')

// 方式 3: 通过 ErrorCenter 分发（推荐在异步回调或无法直接 throw 的地方使用）
errorCenter.emit(Errors.network())
```

### 捕获与处理错误

在业务逻辑中，可以通过 `ErrorCenter` 注册处理器来处理特定错误。

```typescript
import { errorCenter, ErrorCode } from '@/utils'

// 监听特定错误
errorCenter.on(ErrorCode.SONG_NO_COPYRIGHT, error => {
  console.log('跳过无版权歌曲:', error.data.songId)
  // 执行跳过逻辑...
})

// 监听所有错误（通常在 UI 层做统一 Toast 提示）
errorCenter.onAny(error => {
  Toast.show(error.getUserMessage())
})
```

### 最佳实践

1.  **优先使用 `ErrorCode`**：不要使用魔法数字或字符串来判断错误类型。
2.  **区分可恢复性**：对于用户可以重试或忽略的错误，设置 `recoverable: true`；对于程序无法继续运行的严重错误，设置 `recoverable: false`。
3.  **提供用户友好的信息**：在 `getUserMessage` 中维护错误码到用户提示文案的映射。
4.  **统一入口**：尽量通过 `errorCenter.emit()` 分发错误，而不是散落在各处的 `console.error`。
