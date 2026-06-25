import { ref, computed } from 'vue'
import { usePlayerStore } from '@/store/playerStore'
import { services } from '@/services'
import { getPlatformService } from '@/platform'
import type { ChatMessage, PlayerContext, ChatResult, AiDialogueStatus } from './types'
import { mapToolCallToCommand } from './commandMapper'

const AI_ASSISTANT_PLUGIN_ID = 'ai-assistant'

export function useAiDialogue() {
  const playerStore = usePlayerStore()
  const platformService = getPlatformService()
  const messages = ref<ChatMessage[]>([])
  const status = ref<AiDialogueStatus>('idle')
  const error = ref<string | null>(null)

  const isElectron = computed(() => platformService.isElectron())

  function buildContext(): PlayerContext {
    return {
      currentSong: playerStore.currentSongInfo
        ? {
            name: playerStore.currentSongInfo.name,
            artists: playerStore.currentSongInfo.artists.map(a => a.name)
          }
        : undefined,
      playing: playerStore.playing,
      volume: playerStore.volume,
      muted: playerStore.muted,
      playMode: String(playerStore.playMode)
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim()) return
    if (!isElectron.value) {
      error.value = 'AI 助手当前仅支持 Electron 桌面端'
      status.value = 'error'
      return
    }

    messages.value.push({ role: 'user', content })
    status.value = 'loading'
    error.value = null

    try {
      const result = await callPluginChat(messages.value, buildContext())
      await handleChatResult(result)
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (status.value === 'loading') {
        status.value = 'idle'
      }
    }
  }

  async function callPluginChat(
    currentMessages: ChatMessage[],
    context: PlayerContext
  ): Promise<ChatResult> {
    const pluginService = services.plugins()
    const result = await pluginService.call(AI_ASSISTANT_PLUGIN_ID, 'chat', {
      messages: currentMessages,
      context
    })

    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response from ai-assistant plugin')
    }

    return result as ChatResult
  }

  async function handleChatResult(result: ChatResult) {
    if (result.content && !result.toolCalls?.length) {
      messages.value.push({ role: 'assistant', content: result.content })
      status.value = 'idle'
      return
    }

    if (result.toolCalls?.length) {
      const toolResults: string[] = []
      for (const toolCall of result.toolCalls) {
        const execution = mapToolCallToCommand(toolCall)
        if (!execution) {
          toolResults.push(`工具 ${toolCall.function?.name} 无法识别`)
          continue
        }
        try {
          await services.commands().execute(execution.commandId, execution.payload)
          toolResults.push(`已执行 ${toolCall.function?.name}`)
        } catch (err) {
          toolResults.push(
            `执行 ${toolCall.function?.name} 失败: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      messages.value.push({
        role: 'assistant',
        content: result.content ?? '已执行操作',
        tool_call_id: result.toolCalls[0]?.id
      })

      status.value = 'idle'
      return
    }

    messages.value.push({ role: 'assistant', content: '收到，但我不知道该做什么。' })
    status.value = 'idle'
  }

  function clearMessages() {
    messages.value = []
    error.value = null
    status.value = 'idle'
  }

  return {
    messages,
    status,
    error,
    isElectron,
    sendMessage,
    clearMessages
  }
}
