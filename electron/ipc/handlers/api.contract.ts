import type { SongPlatform } from '@shared/types/schemas'

export type BuiltInApiPlatform = 'netease' | 'qq'
export type MusicPlatform = SongPlatform

export type GatewayErrorDetails = {
  code?: string
  status?: number
  responseData?: unknown
  reason?: string
}
