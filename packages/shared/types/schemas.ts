import { z } from 'zod'

export const ArtistSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string()
})

export const AlbumSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  picUrl: z.string()
})

export const BuiltInPlatforms = ['netease', 'qq', 'local'] as const

export type BuiltInPlatform = (typeof BuiltInPlatforms)[number]
export type PlatformId = BuiltInPlatform | (string & {})

export const SongPlatformSchema = z.string().min(1)

export const SongSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  artists: z.array(ArtistSchema),
  album: AlbumSchema,
  duration: z.number(),
  mvid: z.union([z.string(), z.number()]),
  platform: SongPlatformSchema,
  originalId: z.union([z.string(), z.number()]),
  extra: z.record(z.string(), z.unknown()).optional(),
  url: z.string().optional(),
  mediaId: z.union([z.string(), z.number()]).optional(),
  retryCount: z.number().optional(),
  unavailable: z.boolean().optional(),
  errorMessage: z.string().nullable().optional()
})

export const PlaylistDetailSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  coverImgUrl: z.string(),
  description: z.string().optional(),
  trackCount: z.number().optional(),
  tracks: z.array(SongSchema)
})

export const SearchResultSchema = z.object({
  list: z.array(SongSchema),
  total: z.number()
})

export const LyricResultSchema = z.object({
  lrc: z.string(),
  tlyric: z.string(),
  romalrc: z.string()
})

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: z.string().nullable(),
    code: z.number().nullable(),
    raw: z.unknown().optional()
  })

export const MusicUrlDataSchema = z.object({
  id: z.number(),
  url: z.string(),
  br: z.number().optional(),
  size: z.number().optional(),
  type: z.string().optional(),
  level: z.string().optional()
})

export const MusicUrlResponseSchema = z.object({
  code: z.number(),
  data: z.array(MusicUrlDataSchema)
})

export const SearchValidationResultSchema = z.object({
  valid: z.boolean(),
  list: z.array(z.unknown()),
  total: z.number(),
  error: z.string().optional()
})

export const IPCRequestSchema = z.object({
  service: z.string().min(1),
  endpoint: z.string(),
  params: z.record(z.string(), z.unknown()).optional()
})

export const IPCResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  code: z.number().optional()
})

export const ServiceStatusSchema = z.record(
  z.string(),
  z.object({
    running: z.boolean(),
    port: z.number(),
    url: z.string()
  })
)

export const ServiceConfigSchema = z.object({
  name: z.string(),
  port: z.number(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
  readyTimeout: z.number().optional(),
  readyPattern: z.string().optional()
})

export type Artist = z.infer<typeof ArtistSchema>
export type Song = z.infer<typeof SongSchema>
export type Album = z.infer<typeof AlbumSchema>
export type SongPlatform = z.infer<typeof SongPlatformSchema>
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>
export type SearchResult = z.infer<typeof SearchResultSchema>
export type LyricResult = z.infer<typeof LyricResultSchema>
export type MusicUrlData = z.infer<typeof MusicUrlDataSchema>
export type MusicUrlResponse = z.infer<typeof MusicUrlResponseSchema>
export type SearchValidationResult = z.infer<typeof SearchValidationResultSchema>
export type IPCRequest = z.infer<typeof IPCRequestSchema>
export type IPCResponse = z.infer<typeof IPCResponseSchema>
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>
