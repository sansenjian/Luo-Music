import { INVOKE_CHANNELS, SEND_CHANNELS } from '@shared/protocol/channels'

const mutedDebugLogChannels = new Set<string>([
  INVOKE_CHANNELS.PLUGIN_LIST,
  SEND_CHANNELS.LYRIC_TIME_UPDATE
])

export function shouldLogIpcDebug(channel: string): boolean {
  return !mutedDebugLogChannels.has(channel)
}
