/**
 * AI Assistant Plugin
 *
 * Exposes a single `chat` method that forwards messages to a user-configured
 * OpenAI-compatible LLM API with function calling / tools.
 */

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxHistory: 10
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'player_playPause',
      description: '切换当前歌曲的播放/暂停状态',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_next',
      description: '播放下一首歌曲',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_prev',
      description: '播放上一首歌曲',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_setVolume',
      description: '设置播放器音量，volume 范围 0.0 ~ 1.0',
      parameters: {
        type: 'object',
        properties: {
          volume: { type: 'number', description: '音量值，范围 0.0 ~ 1.0' }
        },
        required: ['volume']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_setMute',
      description: '设置静音状态',
      parameters: {
        type: 'object',
        properties: {
          muted: { type: 'boolean', description: 'true 表示静音，false 表示取消静音' }
        },
        required: ['muted']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_setPlayMode',
      description: '设置播放模式',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['sequential', 'random', 'singleLoop', 'listLoop'],
            description: '播放模式'
          }
        },
        required: ['mode']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_searchAndPlay',
      description: '搜索并播放指定歌曲',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '歌曲名、歌手或组合关键词' }
        },
        required: ['query']
      }
    }
  }
]

function normalizeConfig(settings) {
  return {
    baseUrl: typeof settings?.baseUrl === 'string' && settings.baseUrl
      ? settings.baseUrl
      : DEFAULT_CONFIG.baseUrl,
    model: typeof settings?.model === 'string' && settings.model
      ? settings.model
      : DEFAULT_CONFIG.model,
    temperature: Number.isFinite(Number(settings?.temperature))
      ? Number(settings.temperature)
      : DEFAULT_CONFIG.temperature,
    maxHistory: Number.isFinite(Number(settings?.maxHistory))
      ? Math.max(1, Math.round(Number(settings.maxHistory)))
      : DEFAULT_CONFIG.maxHistory
  }
}

function buildSystemPrompt(context) {
  const lines = [
    '你是一个音乐播放器智能助手。用户会通过自然语言让你控制播放器。',
    '请根据用户意图调用合适的工具。如果用户只是聊天，请直接回复。',
    '当前播放上下文：',
    `- 当前歌曲: ${context?.currentSong?.name ?? '无'}`,
    `- 歌手: ${context?.currentSong?.artists?.join(', ') ?? '无'}`,
    `- 播放状态: ${context?.playing ? '播放中' : '已暂停'}`,
    `- 音量: ${Math.round((context?.volume ?? 0) * 100)}%`,
    `- 静音: ${context?.muted ? '是' : '否'}`,
    `- 播放模式: ${context?.playMode ?? 'sequential'}`
  ]
  return lines.join('\n')
}

function safeParseArgs(raw) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export default {
  async create(ctx) {
    const { createPluginCallError } = ctx.sdk
    const config = normalizeConfig(ctx.settings)

    async function chat(payload) {
      if (!payload || typeof payload !== 'object') {
        throw createPluginCallError('INVALID_PAYLOAD', 'chat payload must be an object', {
          retryable: false
        })
      }

      const { messages = [], context = {} } = payload
      const apiKey = ctx.settings?.apiKey

      if (!apiKey || typeof apiKey !== 'string') {
        throw createPluginCallError(
          'MISSING_API_KEY',
          'LLM API key is not configured',
          {
            retryable: false,
            userMessage: '请先配置 LLM API Key'
          }
        )
      }

      const trimmedMessages = Array.isArray(messages)
        ? messages.slice(-config.maxHistory)
        : []

      const requestBody = {
        model: config.model,
        temperature: config.temperature,
        messages: [
          { role: 'system', content: buildSystemPrompt(context) },
          ...trimmedMessages
        ],
        tools: TOOLS,
        tool_choice: 'auto'
      }

      try {
        const response = await ctx.http.post(`${config.baseUrl}/chat/completions`, requestBody, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeoutMs: 30000
        })

        const choice = response?.choices?.[0]
        const message = choice?.message
        const toolCalls = message?.tool_calls ?? []

        return {
          content: message?.content ?? '',
          toolCalls: toolCalls.map(tc => ({
            id: tc.id,
            function: {
              name: tc.function?.name,
              arguments: safeParseArgs(tc.function?.arguments)
            }
          }))
        }
      } catch (error) {
        ctx.logger.error('LLM API call failed', { error: String(error) })
        throw createPluginCallError(
          'LLM_API_ERROR',
          error instanceof Error ? error.message : String(error),
          {
            retryable: true,
            userMessage: 'AI 服务调用失败，请检查网络或 API 配置'
          }
        )
      }
    }

    return {
      chat
    }
  }
}
