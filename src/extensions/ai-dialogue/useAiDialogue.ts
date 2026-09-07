import { ref, computed, watch } from 'vue'
import { usePlayerStore } from '@/store/playerStore'
import { services } from '@/services'
import { getPlatformService } from '@/platform'
import { COMMANDS } from '@/core/commands/commands'
import { PLAY_MODE_TEXTS } from '@/store/player/playerState'
import type { ChatMessage, PlayerContext, ChatResult, AiDialogueStatus } from './types'
import { mapToolCallToCommand } from './commandMapper'
import { callLlm, callLlmRaw, type InvokeFn } from './llmClient'
import { useJargonStore } from './jargonStore'
import { getJargonProvider } from './jargonLoader'
import type { JargonLlmCaller } from './jargonProvider'

/** 将命令执行成功转为用户友好的简短描述 */
function toolCallSuccessText(commandId: string, payload?: Record<string, unknown>): string {
  switch (commandId) {
    case COMMANDS.PLAYER_TOGGLE_PLAY:
      return '已切换播放/暂停'
    case COMMANDS.PLAYER_PLAY_NEXT:
      return '已播放下一首'
    case COMMANDS.PLAYER_PLAY_PREV:
      return '已播放上一首'
    case COMMANDS.PLAYER_SET_VOLUME: {
      const vol = payload?.volume
      if (typeof vol === 'number') {
        return `音量已设为 ${Math.round(vol * 100)}%`
      }
      return '音量已调整'
    }
    case COMMANDS.PLAYER_SET_MUTE:
      return payload?.muted ? '已静音' : '已取消静音'
    case COMMANDS.PLAYER_SET_PLAY_MODE:
      return '播放模式已切换'
    case COMMANDS.PLAYER_SEARCH_AND_PLAY: {
      const query = payload?.query
      return typeof query === 'string' ? `已为你播放「${query}」` : '已为你播放'
    }
    default:
      return '已完成'
  }
}

/** 将平台命令返回的数据摘要为文本，供 AI 第二轮对话使用 */
function summarizePlatformResult(commandId: string, result: unknown): string {
  try {
    if (commandId === COMMANDS.PLATFORM_SEARCH) {
      const data = result as {
        songs?: Array<{ id: string | number; name: string; artists?: string[] }>
      }
      const songs = data?.songs ?? []
      if (songs.length === 0) return '搜索结果为空'
      const list = songs
        .slice(0, 10)
        .map((s, i) => `${i + 1}. ${s.name} - ${(s.artists ?? []).join(', ')}`)
        .join('\n')
      return `搜索到 ${songs.length} 首歌曲:\n${list}`
    }
    if (commandId === COMMANDS.PLATFORM_GET_LYRIC) {
      const data = result as { lyric?: string }
      const lyric = data?.lyric ?? ''
      // 截取前 500 字避免过长
      return `歌词:\n${lyric.slice(0, 500)}${lyric.length > 500 ? '...' : ''}`
    }
    if (commandId === COMMANDS.PLATFORM_GET_PLAYLIST_DETAIL) {
      const data = result as {
        name?: string
        tracks?: Array<{ name: string; artists?: string[] }>
      }
      const tracks = data?.tracks ?? []
      const list = tracks
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.name} - ${(t.artists ?? []).join(', ')}`)
        .join('\n')
      return `歌单「${data?.name ?? '未知'}」共 ${tracks.length} 首:\n${list}`
    }
  } catch {
    // 解析失败时返回原始 JSON 片段
  }
  const json = JSON.stringify(result)
  return json.length > 500 ? json.slice(0, 500) + '...' : json
}

export function useAiDialogue() {
  const playerStore = usePlayerStore()
  const platformService = getPlatformService()
  const { buildJargonPrompt, queryJargons } = useJargonStore()

  // 优化4：对话历史持久化
  const STORAGE_KEY = 'ai-dialogue:messages'
  const MAX_MESSAGES = 50

  const savedMessages = (() => {
    try {
      const raw = services.storage().getJSON<ChatMessage[]>(STORAGE_KEY) ?? []
      return raw.slice(-MAX_MESSAGES)
    } catch {
      return []
    }
  })()

  const messages = ref<ChatMessage[]>(savedMessages)
  const status = ref<AiDialogueStatus>('idle')
  const error = ref<string | null>(null)

  // 监听消息变化，自动保存
  watch(
    messages,
    msgs => {
      // 内存中只保留最近 MAX_MESSAGES 条，避免内存与 LLM token 膨胀
      if (msgs.length > MAX_MESSAGES) {
        messages.value = msgs.slice(-MAX_MESSAGES)
        return
      }
      try {
        services.storage().setJSON(STORAGE_KEY, msgs.slice(-MAX_MESSAGES))
      } catch {
        // 忽略写入失败
      }
    },
    { deep: true }
  )

  const isElectron = computed(() => platformService.isElectron())

  // 优化1：playMode 转为中文名称，让 AI 更好理解
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
      playMode: PLAY_MODE_TEXTS[playerStore.playMode] ?? String(playerStore.playMode)
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
      const invokeFn = window.services?.invoke as InvokeFn | undefined

      if (!invokeFn) {
        throw new Error('AI 助手当前仅支持 Electron 桌面端')
      }

      const result = await callLlm(messages.value, buildContext(), invokeFn, buildJargonPrompt())
      await handleChatResult(result, invokeFn)

      // 对话结束后，异步触发黑话自动学习（通过插件，不阻塞用户）
      learnJargonFromDialogue(messages.value, invokeFn).catch(() => {
        // 静默失败
      })
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (status.value === 'loading') {
        status.value = 'idle'
      }
    }
  }

  async function handleChatResult(result: ChatResult, invokeFn: InvokeFn) {
    /** 统一的 LLM 调用参数构建（避免第一轮/第二轮重复传参） */
    const callLlmWithCtx = () =>
      callLlm(messages.value, buildContext(), invokeFn, buildJargonPrompt())

    if (result.content && !result.toolCalls?.length) {
      messages.value.push({ role: 'assistant', content: result.content })
      status.value = 'idle'
      return
    }

    if (result.toolCalls?.length) {
      const toolResults: string[] = []
      let hasPlatformResult = false
      const platformResults: string[] = []

      for (const toolCall of result.toolCalls) {
        // jargon_query 特殊处理：本地查询黑话词典，不走 command service
        if (toolCall.function.name === 'jargon_query') {
          const words = Array.isArray(toolCall.function.arguments.words)
            ? (toolCall.function.arguments.words as string[])
            : []
          const queryResult = queryJargons(words)
          const summary = queryResult
            .map(r =>
              r.found ? `"${r.word}": ${r.meaning || '（含义待推断）'}` : `"${r.word}": 未收录`
            )
            .join('\n')
          hasPlatformResult = true
          platformResults.push(`黑话查询结果:\n${summary}`)
          toolResults.push(summary)
          continue
        }

        const execution = mapToolCallToCommand(toolCall)
        if (!execution) {
          toolResults.push('未识别该操作')
          continue
        }
        try {
          const cmdResult = await services
            .commands()
            .execute(execution.commandId, execution.payload)

          // 平台工具返回数据，需要回传给 AI 继续对话
          if (execution.hasResult && cmdResult !== undefined) {
            hasPlatformResult = true
            const summary = summarizePlatformResult(execution.commandId, cmdResult)
            platformResults.push(summary)
            toolResults.push(summary)
          } else {
            toolResults.push(toolCallSuccessText(execution.commandId, execution.payload))
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (execution.commandId === COMMANDS.PLAYER_TOGGLE_PLAY && errMsg.includes('disabled')) {
            try {
              await services
                .commands()
                .execute(COMMANDS.PLAYER_SEARCH_AND_PLAY, { query: '热门歌曲' })
              toolResults.push('当前没有歌曲，已为你播放热门歌曲')
            } catch (searchErr) {
              toolResults.push(
                `播放失败: ${searchErr instanceof Error ? searchErr.message : String(searchErr)}`
              )
            }
          } else {
            toolResults.push(`操作失败: ${errMsg}`)
          }
        }
      }

      // 如果有平台工具返回了数据，把结果回传给 AI 做第二轮对话
      if (hasPlatformResult && invokeFn) {
        // 先记录第一轮的 assistant 回复（含工具调用结果）
        const firstReply = result.content?.trim() || toolResults.join('；')
        messages.value.push({
          role: 'assistant',
          content: firstReply,
          tool_call_id: result.toolCalls[0]?.id
        })
        // 把工具结果作为 user 消息回传，让 AI 基于数据回复用户
        const toolData = platformResults.join('\n\n')
        messages.value.push({
          role: 'user',
          content: `[工具执行结果]\n${toolData}\n请根据以上结果用简洁中文回复用户。`
        })
        // 发起第二轮对话
        try {
          const secondResult = await callLlmWithCtx()
          if (secondResult.content) {
            messages.value.push({ role: 'assistant', content: secondResult.content })
          }
          // 第二轮如果还有工具调用，继续处理
          if (secondResult.toolCalls?.length) {
            await handleChatResult(secondResult, invokeFn)
          }
        } catch {
          // 第二轮失败时，至少展示第一轮结果
          messages.value.push({ role: 'assistant', content: firstReply })
        }
        status.value = 'idle'
        return
      }

      // 普通工具调用：只在 LLM 没有返回文字时才补充操作结果
      const resultContent = result.content?.trim()
      const toolResultText = toolResults.join('；')
      const replyContent = resultContent || toolResultText

      messages.value.push({
        role: 'assistant',
        content: replyContent,
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
    try {
      services.storage().removeItem(STORAGE_KEY)
    } catch {
      // 忽略
    }
  }

  /**
   * 黑话自动学习流程（通过插件实现）
   * 1. 获取 JargonProvider（内置或第三方插件）
   * 2. 调用插件 extract() 提取候选
   * 3. 写入 jargonStore（count+1）
   * 4. 对达到阈值的条目调用插件 infer() 推断含义
   */
  async function learnJargonFromDialogue(
    dialogueMessages: ChatMessage[],
    invokeFn: InvokeFn
  ): Promise<void> {
    const provider = await getJargonProvider()

    // 构建注入给插件的 LLM 调用器（播放器控制 API 配置）
    const llmCaller: JargonLlmCaller = {
      callRaw(messages, temperature) {
        return callLlmRaw(messages, invokeFn, temperature)
      }
    }

    // 提取阶段
    const extractResult = await provider.extract({
      messages: dialogueMessages,
      llm: llmCaller
    })
    if (extractResult.jargons.length === 0) return

    // 持久化阶段：写入 store
    const store = useJargonStore()
    for (const item of extractResult.jargons) {
      store.upsertJargon(item.content, item.context)
    }

    // 推断阶段：对达到阈值的条目推断含义
    const pending = store.jargons.value.filter(j => store.shouldInfer(j))
    for (const entry of pending) {
      try {
        const result = await provider.infer({ entry, llm: llmCaller })
        store.updateMeaning(entry.id, result.meaning, result.isJargon)
        store.markInferred(entry.id, entry.count)
      } catch {
        store.markInferred(entry.id, entry.count)
      }
    }
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
