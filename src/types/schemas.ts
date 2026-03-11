/**
 * Zod Schema 定义
 * 用于 API 响应验证和运行时类型检查
 */

import { z } from 'zod'

// ============================================================================
// 基础类型 Schema
// ============================================================================

/** 艺术家 Schema */
export const ArtistSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
})

/** 专辑 Schema */
export const AlbumSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  picUrl: z.string(),
})

/** 歌曲 Schema */
export const SongSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  artists: z.array(ArtistSchema),
  album: AlbumSchema,
  duration: z.number(),
  mvid: z.union([z.string(), z.number()]),
  platform: z.enum(['netease', 'qq']),
  originalId: z.union([z.string(), z.number()]),
  extra: z.record(z.any()).optional(),
})

/** 歌单详情 Schema */
export const PlaylistDetailSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  coverImgUrl: z.string(),
  description: z.string().optional(),
  trackCount: z.number().optional(),
  tracks: z.array(SongSchema),
})

/** 搜索结果 Schema */
export const SearchResultSchema = z.object({
  list: z.array(SongSchema),
  total: z.number(),
})

/** 歌词结果 Schema */
export const LyricResultSchema = z.object({
  lrc: z.string(),
  tlyric: z.string(),
  romalrc: z.string(),
})

// ============================================================================
// API 响应 Schema
// ============================================================================

/** 通用 API 响应 Schema */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: z.string().nullable(),
    code: z.number().nullable(),
    raw: z.unknown().optional(),
  })

/** 音乐 URL 数据 Schema */
export const MusicUrlDataSchema = z.object({
  id: z.number(),
  url: z.string(),
  br: z.number().optional(),
  size: z.number().optional(),
  type: z.string().optional(),
  level: z.string().optional(),
})

/** 音乐 URL 响应 Schema */
export const MusicUrlResponseSchema = z.object({
  code: z.number(),
  data: z.array(MusicUrlDataSchema),
})

/** 搜索验证结果 Schema */
export const SearchValidationResultSchema = z.object({
  valid: z.boolean(),
  list: z.array(z.unknown()),
  total: z.number(),
  error: z.string().optional(),
})

// ============================================================================
// QQ 音乐特定 Schema
// ============================================================================

/** QQ 音乐搜索项 Schema */
export const QQMusicSearchItemSchema = z.object({
  id: z.string().or(z.number()),
  mid: z.string().optional(),
  name: z.string(),
  singer: z.array(z.object({
    id: z.string().or(z.number()).optional(),
    name: z.string(),
  })).optional(),
  album: z.object({
    id: z.string().or(z.number()).optional(),
    name: z.string(),
    mid: z.string().optional(),
  }).optional(),
  interval: z.number().optional(),
  mv: z.object({
    id: z.number().or(z.string()).optional(),
  }).optional(),
})

/** QQ 音乐搜索响应 Schema */
export const QQMusicSearchResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    song: z.object({
      list: z.array(QQMusicSearchItemSchema),
      totalnum: z.number(),
    }).optional(),
  }).optional(),
})

// ============================================================================
// 网易云音乐特定 Schema
// ============================================================================

/** 网易云音乐歌曲项 Schema */
export const NeteaseSongItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  ar: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })).optional(),
  al: z.object({
    id: z.number(),
    name: z.string(),
    picUrl: z.string().optional(),
  }).optional(),
  dt: z.number().optional(),
  mv: z.number().optional(),
})

/** 网易云音乐搜索响应 Schema */
export const NeteaseSearchResponseSchema = z.object({
  code: z.number(),
  result: z.object({
    songs: z.array(NeteaseSongItemSchema).optional(),
    songCount: z.number().optional(),
  }).optional(),
})

// ============================================================================
// IPC 通信 Schema
// ============================================================================

/** IPC 请求参数 Schema */
export const IPCRequestSchema = z.object({
  service: z.enum(['netease', 'qq']),
  endpoint: z.string(),
  params: z.record(z.unknown()).optional(),
})

/** IPC 响应 Schema */
export const IPCResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  code: z.number().optional(),
})

// ============================================================================
// 服务状态 Schema
// ============================================================================

/** 服务状态 Schema */
export const ServiceStatusSchema = z.object({
  netease: z.object({
    running: z.boolean(),
    port: z.number(),
    url: z.string(),
  }),
  qq: z.object({
    running: z.boolean(),
    port: z.number(),
    url: z.string(),
  }),
})

/** 服务配置 Schema */
export const ServiceConfigSchema = z.object({
  name: z.string(),
  port: z.number(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
  readyTimeout: z.number().optional(),
  readyPattern: z.string().optional(),
})

// ============================================================================
// 类型导出 (从 Schema 推导)
// ============================================================================

export type Artist = z.infer<typeof ArtistSchema>
export type Song = z.infer<typeof SongSchema>
export type Album = z.infer<typeof AlbumSchema>
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>
export type SearchResult = z.infer<typeof SearchResultSchema>
export type LyricResult = z.infer<typeof LyricResultSchema>
export type MusicUrlData = z.infer<typeof MusicUrlDataSchema>
export type MusicUrlResponse = z.infer<typeof MusicUrlResponseSchema>
export type SearchValidationResult = z.infer<typeof SearchValidationResultSchema>
export type QQMusicSearchItem = z.infer<typeof QQMusicSearchItemSchema>
export type QQMusicSearchResponse = z.infer<typeof QQMusicSearchResponseSchema>
export type NeteaseSongItem = z.infer<typeof NeteaseSongItemSchema>
export type NeteaseSearchResponse = z.infer<typeof NeteaseSearchResponseSchema>
export type IPCRequest = z.infer<typeof IPCRequestSchema>
export type IPCResponse = z.infer<typeof IPCResponseSchema>
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>

// ============================================================================
// 验证函数
// ============================================================================

/**
 * 验证搜索响应数据
 * 替代原有的 validateSearchResponse 函数
 */
export function validateSearchResponse(data: unknown): SearchValidationResult {
  // QQ 音乐格式: { song: { list: [], totalnum: N } }
  const qqSchema = z.object({
    song: z.object({
      list: z.array(z.unknown()),
      totalnum: z.number(),
    }),
  })

  const qqResult = qqSchema.safeParse(data)
  if (qqResult.success) {
    return {
      valid: true,
      list: qqResult.data.song.list,
      total: qqResult.data.song.totalnum,
    }
  }

  // 网易云格式: { songs: [], songCount: N }
  const neteaseSchema = z.object({
    songs: z.array(z.unknown()),
    songCount: z.number(),
  })

  const neteaseResult = neteaseSchema.safeParse(data)
  if (neteaseResult.success) {
    return {
      valid: true,
      list: neteaseResult.data.songs,
      total: neteaseResult.data.songCount,
    }
  }

  // 通用格式: { list: [], total: N }
  const genericSchema = z.object({
    list: z.array(z.unknown()),
    total: z.number(),
  })

  const genericResult = genericSchema.safeParse(data)
  if (genericResult.success) {
    return {
      valid: true,
      list: genericResult.data.list,
      total: genericResult.data.total,
    }
  }

  return {
    valid: false,
    list: [],
    total: 0,
    error: '未知的数据格式',
  }
}

/**
 * 安全解析 API 响应
 * 返回解析后的数据或 null
 */
export function safeParseResponse<T>(
  schema: z.ZodType<T>,
  data: unknown
): T | null {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }
  console.warn('[Schema Validation] 解析失败:', result.error.errors)
  return null
}

/**
 * 验证并抛出错误
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = context
      ? `${context}: ${result.error.errors.map(e => e.message).join(', ')}`
      : result.error.errors.map(e => e.message).join(', ')
    throw new Error(message)
  }
  return result.data
}
