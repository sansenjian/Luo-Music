/**
 * LLM 客户端 — 直接在渲染进程中构建请求，通过 IPC 代理发起 HTTP 调用。
 *
 * 不再依赖外部插件安装；配置存储在 localStorage。
 */

import { INVOKE_CHANNELS } from '@shared/protocol/channels'
import type { LlmChatPayload, LlmChatResponse } from '@shared/contracts/ipc'
import { services } from '@/services'
import { ALL_TOOLS } from './toolDefinitions'
import type { ChatMessage, PlayerContext, ChatResult } from './types'

// ========== 配置管理 ==========

const STORAGE_PREFIX = 'ai-dialogue:'

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  maxHistory: number
}

const DEFAULT_CONFIG: LlmConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxHistory: 10
}

export function loadConfig(): LlmConfig {
  const storage = services.storage()
  return {
    apiKey: storage.getItem(`${STORAGE_PREFIX}apiKey`) ?? DEFAULT_CONFIG.apiKey,
    baseUrl: storage.getItem(`${STORAGE_PREFIX}baseUrl`) ?? DEFAULT_CONFIG.baseUrl,
    model: storage.getItem(`${STORAGE_PREFIX}model`) ?? DEFAULT_CONFIG.model,
    temperature:
      Number(storage.getItem(`${STORAGE_PREFIX}temperature`)) || DEFAULT_CONFIG.temperature,
    maxHistory: Number(storage.getItem(`${STORAGE_PREFIX}maxHistory`)) || DEFAULT_CONFIG.maxHistory
  }
}

export function saveConfig(config: Partial<LlmConfig>): void {
  const storage = services.storage()
  for (const [key, value] of Object.entries(config)) {
    storage.setItem(`${STORAGE_PREFIX}${key}`, String(value))
  }
}

// ========== 系统提示词 ==========

function buildSystemPrompt(context: PlayerContext, jargonPrompt?: string): string {
  const lines = [
    '你是音乐播放器助手，用户用自然语言控制播放器。',
    '原则：直接行动，不要反问，回复简洁口语化（10字以内）。',
    '- "播放音乐""来首歌" → player_searchAndPlay, query="热门歌曲"',
    '- "播放周杰伦" → player_searchAndPlay, query="周杰伦"',
    '- "播放1" → player_searchAndPlay, query="1"',
    '- "暂停""继续" → player_playPause',
    '- "下一首" → player_next，"上一首" → player_prev',
    '- "音量大点""小声点" → player_setVolume',
    '- "静音""取消静音" → player_setMute',
    '- "随机播放""单曲循环" → player_setPlayMode',
    '- "搜一下周杰伦的歌" → platform_search, 返回列表给用户看',
    '- "这首歌歌词" → platform_getLyric, 用当前歌曲的 songId',
    '- "看看歌单" → platform_getPlaylistDetail',
    '- 纯闲聊才直接回复，不调用工具',
    '- 平台可选: netease(网易云音乐), qq(QQ音乐)',
    '当前播放上下文：',
    `- 当前歌曲: ${context?.currentSong?.name ?? '无'}`,
    `- 歌手: ${context?.currentSong?.artists?.join(', ') ?? '无'}`,
    `- 播放状态: ${context?.playing ? '播放中' : '已暂停'}`,
    `- 音量: ${Math.round((context?.volume ?? 0) * 100)}%`,
    `- 静音: ${context?.muted ? '是' : '否'}`,
    `- 播放模式: ${context?.playMode ?? 'sequential'}`
  ]
  if (jargonPrompt) {
    lines.push(jargonPrompt)
  }
  return lines.join('\n')
}

// ========== 共享类型 ==========

export type InvokeFn = (channel: string, ...args: unknown[]) => Promise<unknown>

// ========== 辅助函数 ==========

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ========== LLM 请求基础设施 ==========

interface LlmRequestBody {
  model: string
  temperature: number
  messages: Array<{ role: string; content: string }>
  tools?: typeof ALL_TOOLS
  tool_choice?: string
  [key: string]: unknown
}

/**
 * 底层 LLM API 调用：构建 payload → IPC 代理 → 返回原始响应数据。
 * callLlm 和 callLlmRaw 的公共基础设施。
 */
async function callLlmApi(body: LlmRequestBody, invokeFn?: InvokeFn): Promise<unknown> {
  const config = loadConfig()

  if (!config.apiKey) {
    throw new Error('请先配置 LLM API Key（点击设置按钮）')
  }

  const invoke = invokeFn ?? (typeof window !== 'undefined' ? window.services?.invoke : undefined)
  if (!invoke || typeof invoke !== 'function') {
    throw new Error('AI 助手当前仅支持 Electron 桌面端')
  }

  const payload: LlmChatPayload = {
    url: `${config.baseUrl}/chat/completions`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  }

  const response = (await invoke(INVOKE_CHANNELS.LLM_CHAT, payload)) as LlmChatResponse

  if (!response.ok) {
    throw new Error(response.error ?? 'LLM API 调用失败')
  }

  return response.data
}

// ========== 核心：调用 LLM ==========

/**
 * 通过主进程 IPC 代理调用 LLM API（绕过 CORS）。
 *
 * @param invokeFn - IPC invoke 函数（由调用方注入，解耦 window.services 直接访问）
 * @throws 如果 invokeFn 不可用或 API 调用失败
 */
export async function callLlm(
  messages: ChatMessage[],
  context: PlayerContext,
  invokeFn?: InvokeFn,
  jargonPrompt?: string
): Promise<ChatResult> {
  // 深拷贝去除 Vue 响应式代理，IPC 结构化克隆无法处理 Proxy 对象
  const config = loadConfig()
  const plainMessages = JSON.parse(
    JSON.stringify(messages.slice(-config.maxHistory))
  ) as ChatMessage[]
  const plainContext = JSON.parse(JSON.stringify(context)) as PlayerContext

  const data = await callLlmApi(
    {
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: buildSystemPrompt(plainContext, jargonPrompt) },
        ...plainMessages
      ],
      tools: ALL_TOOLS,
      tool_choice: 'auto'
    },
    invokeFn
  )

  // 解析 OpenAI 兼容格式的响应
  const resp = data as {
    choices?: Array<{
      message?: {
        content?: string
        tool_calls?: Array<{
          id: string
          function?: { name?: string; arguments?: string }
        }>
      }
    }>
  }

  const choice = resp?.choices?.[0]
  const message = choice?.message
  const toolCalls = message?.tool_calls ?? []

  return {
    content: message?.content ?? '',
    toolCalls: toolCalls.map(tc => ({
      id: tc.id,
      function: {
        name: tc.function?.name ?? '',
        arguments: safeParseArgs(tc.function?.arguments)
      }
    }))
  }
}

// ========== 原始 LLM 调用（供黑话学习器使用） ==========

/**
 * 不带 tools 的原始 LLM 调用，用于黑话提取和含义推断。
 * 返回纯文本响应。
 */
export async function callLlmRaw(
  messages: Array<{ role: string; content: string }>,
  invokeFn?: InvokeFn,
  temperature?: number
): Promise<string> {
  const config = loadConfig()

  const data = await callLlmApi(
    {
      model: config.model,
      temperature: temperature ?? 0.1,
      messages
      // 不传 tools，纯文本对话
    },
    invokeFn
  )

  const resp = data as {
    choices?: Array<{ message?: { content?: string } }>
  }

  return resp?.choices?.[0]?.message?.content ?? ''
}
