# AI 对话控制播放器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个外部插件 `ai-assistant` 和内置扩展 `ai-dialogue`，让用户通过可拖拽悬浮对话窗用自然语言控制播放器。

**Architecture:** LLM 配置与 Function Calling 调用放在隔离的插件 Worker 中；渲染进程内的内置扩展负责 UI、采集播放器上下文、调用插件解析结果、把 tool_calls 映射为 `CommandService` 命令执行。本阶段先支持 Electron 桌面端，因为外部插件调用依赖主进程 bridge。

**Tech Stack:** Vue 3, TypeScript, Pinia (`playerStore`), 项目插件 SDK, OpenAI 兼容 API, `CommandService`。

---

## 文件结构

### 新增文件

- `plugins/third-party/ai-assistant/manifest.json`
- `plugins/third-party/ai-assistant/index.mjs`
- `src/extensions/ai-dialogue/index.ts`
- `src/extensions/ai-dialogue/types.ts`
- `src/extensions/ai-dialogue/toolDefinitions.ts`
- `src/extensions/ai-dialogue/commandMapper.ts`
- `src/extensions/ai-dialogue/useAiDialogue.ts`
- `src/extensions/ai-dialogue/AiDialogueButton.vue`
- `src/extensions/ai-dialogue/AiDialoguePanel.vue`
- `tests/extensions/ai-dialogue/commandMapper.test.ts`
- `tests/extensions/ai-dialogue/useAiDialogue.test.ts`

### 修改文件

- `src/core/commands/commands.ts` — 新增 `PLAYER_SET_VOLUME`、`PLAYER_SET_MUTE`、`PLAYER_SET_PLAY_MODE`、`PLAYER_SEARCH_AND_PLAY`
- `src/services/commandService.ts` — 注册上述新命令
- `src/App.vue`（或播放器主页面）— 挂载 `useAiDialogueExtension`

---

## Task 1: 扩展 CommandService 支持参数化播放器命令

**Files:**

- Modify: `src/core/commands/commands.ts`
- Modify: `src/services/commandService.ts`
- Test: `tests/services/commandService.test.ts`（如存在则补充）

- [ ] **Step 1: 在 `commands.ts` 新增命令常量**

```ts
export const COMMANDS = {
  PLAYER_TOGGLE_PLAY: 'player.togglePlay',
  PLAYER_PLAY_PREV: 'player.playPrev',
  PLAYER_PLAY_NEXT: 'player.playNext',
  PLAYER_TOGGLE_PLAY_MODE: 'player.togglePlayMode',
  PLAYER_VOLUME_UP: 'player.volumeUp',
  PLAYER_VOLUME_DOWN: 'player.volumeDown',
  PLAYER_SEEK_FORWARD: 'player.seekForward',
  PLAYER_SEEK_BACK: 'player.seekBack',
  PLAYER_TOGGLE_PLAYER_DOCKED: 'player.togglePlayerDocked',
  DESKTOP_LYRIC_TOGGLE: 'desktopLyric.toggle',
  PLAYER_SET_VOLUME: 'player.setVolume',
  PLAYER_SET_MUTE: 'player.setMute',
  PLAYER_SET_PLAY_MODE: 'player.setPlayMode',
  PLAYER_SEARCH_AND_PLAY: 'player.searchAndPlay'
} as const
```

- [ ] **Step 2: 在 `commandService.ts` 顶部新增 payload 类型**

```ts
type SetVolumePayload = {
  volume: number
}

type SetMutePayload = {
  muted: boolean
}

type SetPlayModePayload = {
  mode: number
}

type SearchAndPlayPayload = {
  query: string
}
```

- [ ] **Step 3: 在 `commandService.ts` 注册新命令**

在 `register(COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED, ...)` 之前插入：

```ts
register<SetVolumePayload>(COMMANDS.PLAYER_SET_VOLUME, payload => {
  const volume = payload?.volume
  if (typeof volume !== 'number' || !Number.isFinite(volume)) {
    throw new Error('[CommandService] PLAYER_SET_VOLUME requires a numeric volume')
  }
  getPlayerStore().setVolume(Math.max(0, Math.min(1, volume)))
})

register<SetMutePayload>(COMMANDS.PLAYER_SET_MUTE, payload => {
  const muted = payload?.muted
  if (typeof muted !== 'boolean') {
    throw new Error('[CommandService] PLAYER_SET_MUTE requires a boolean muted')
  }
  const playerStore = getPlayerStore()
  if (playerStore.muted !== muted) {
    playerStore.toggleMute()
  }
})

register<SetPlayModePayload>(COMMANDS.PLAYER_SET_PLAY_MODE, payload => {
  const mode = payload?.mode
  if (typeof mode !== 'number' || !Number.isFinite(mode)) {
    throw new Error('[CommandService] PLAYER_SET_PLAY_MODE requires a numeric mode')
  }
  getPlayerStore().setPlayMode(mode)
})

register<SearchAndPlayPayload>(COMMANDS.PLAYER_SEARCH_AND_PLAY, async payload => {
  const query = payload?.query
  if (!query || typeof query !== 'string') {
    throw new Error('[CommandService] PLAYER_SEARCH_AND_PLAY requires a query string')
  }
  const playerStore = getPlayerStore()
  const searchStore = useSearchStore()
  const result = await searchStore.search(query, { limit: 5 })
  const song = result?.list?.[0]
  if (!song) {
    throw new Error(`[CommandService] No song found for query: ${query}`)
  }
  await playerStore.playSong(song)
})
```

> 注：`useSearchStore()` 需要从 `src/store/searchStore.ts` 导入。如果搜索返回类型不同，以实际 store 为准。

- [ ] **Step 4: 运行现有命令服务测试**

Run: `npm run test:run -- tests/services/commandService.test.ts`
Expected: PASS（如果测试不存在则跳过）

- [ ] **Step 5: 提交**

```bash
git add src/core/commands/commands.ts src/services/commandService.ts
git commit --no-verify -m "feat(command): add parameterized player commands for AI control"
```

---

## Task 2: 创建外部插件 `ai-assistant`

**Files:**

- Create: `plugins/third-party/ai-assistant/manifest.json`
- Create: `plugins/third-party/ai-assistant/index.mjs`
- Create: `plugins/third-party/ai-assistant/README.md`

- [ ] **Step 1: 创建插件 manifest**

```json
{
  "manifestVersion": 2,
  "id": "ai-assistant",
  "name": "AI 播放器助手",
  "version": "1.0.0",
  "description": "通过自然语言与 AI 对话控制播放器。需要用户自行配置 OpenAI 兼容的 LLM API。",
  "author": "Luo-Music",
  "category": "extension",
  "platformId": "ai-assistant",
  "source": "external",
  "runtime": "external-host",
  "entry": {
    "main": "index.mjs",
    "module": "esm"
  },
  "engines": {
    "pluginApi": "^1.0.0",
    "app": ">=2.3.0"
  },
  "capabilities": {
    "search": false,
    "songUrl": false,
    "songDetail": false,
    "lyric": false,
    "playlistDetail": false,
    "needsHydration": false,
    "supportsLyricFetch": false,
    "supportsUrlRefreshOnFailure": false
  },
  "capabilitiesV2": {
    "storage": true,
    "network": {
      "domains": ["api.deepseek.com", "api.openai.com"]
    },
    "secrets": true
  },
  "permissions": {
    "network": {
      "domains": ["api.deepseek.com", "api.openai.com"]
    },
    "storage": true,
    "secrets": true
  },
  "contributions": {
    "settings": [
      {
        "key": "apiKey",
        "type": "text",
        "label": "LLM API Key"
      },
      {
        "key": "baseUrl",
        "type": "text",
        "label": "API 基础地址",
        "default": "https://api.deepseek.com/v1"
      },
      {
        "key": "model",
        "type": "text",
        "label": "模型名",
        "default": "deepseek-chat"
      },
      {
        "key": "temperature",
        "type": "text",
        "label": "Temperature",
        "default": "0.3"
      },
      {
        "key": "maxHistory",
        "type": "text",
        "label": "最大历史轮数",
        "default": "10"
      }
    ]
  },
  "contributionsV2": [
    {
      "type": "settings",
      "settings": [
        {
          "key": "apiKey",
          "type": "text",
          "label": "LLM API Key"
        },
        {
          "key": "baseUrl",
          "type": "text",
          "label": "API 基础地址",
          "default": "https://api.deepseek.com/v1"
        },
        {
          "key": "model",
          "type": "text",
          "label": "模型名",
          "default": "deepseek-chat"
        },
        {
          "key": "temperature",
          "type": "text",
          "label": "Temperature",
          "default": "0.3"
        },
        {
          "key": "maxHistory",
          "type": "text",
          "label": "最大历史轮数",
          "default": "10"
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: 创建插件入口 `index.mjs`**

```js
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
    baseUrl:
      typeof settings?.baseUrl === 'string' && settings.baseUrl
        ? settings.baseUrl
        : DEFAULT_CONFIG.baseUrl,
    model:
      typeof settings?.model === 'string' && settings.model ? settings.model : DEFAULT_CONFIG.model,
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
      const apiKey = ctx.secrets?.get
        ? await ctx.secrets.get('apiKey')
        : (ctx.settings?.apiKey ?? '')

      if (!apiKey || typeof apiKey !== 'string') {
        throw createPluginCallError('MISSING_API_KEY', 'LLM API key is not configured', {
          retryable: false,
          userMessage: '请先配置 LLM API Key'
        })
      }

      const trimmedMessages = Array.isArray(messages) ? messages.slice(-config.maxHistory) : []

      const requestBody = {
        model: config.model,
        temperature: config.temperature,
        messages: [{ role: 'system', content: buildSystemPrompt(context) }, ...trimmedMessages],
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

    function safeParseArgs(raw) {
      if (!raw) return {}
      try {
        return JSON.parse(raw)
      } catch {
        return {}
      }
    }

    return {
      chat
    }
  }
}
```

- [ ] **Step 3: 创建 README**

```markdown
# AI Assistant 插件

为 LUO Music 提供自然语言控制播放器能力。

## 配置

在插件设置中填写：

- LLM API Key：你的 API Key
- API 基础地址：如 `https://api.deepseek.com/v1`
- 模型名：如 `deepseek-chat`
- Temperature：建议 0.3
- 最大历史轮数：建议 10

## 支持指令

播放/暂停、上一首、下一首、调音量、静音、切换播放模式、搜索并播放指定歌曲。
```

- [ ] **Step 4: 提交插件文件**

```bash
git add plugins/third-party/ai-assistant/
git commit --no-verify -m "feat(plugin): add ai-assistant external plugin for LLM function calling"
```

---

## Task 3: 创建内置扩展核心逻辑

**Files:**

- Create: `src/extensions/ai-dialogue/types.ts`
- Create: `src/extensions/ai-dialogue/toolDefinitions.ts`
- Create: `src/extensions/ai-dialogue/commandMapper.ts`
- Create: `src/extensions/ai-dialogue/useAiDialogue.ts`
- Test: `tests/extensions/ai-dialogue/commandMapper.test.ts`

- [ ] **Step 1: 创建类型定义 `types.ts`**

```ts
export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatMessageRole
  content: string
  tool_call_id?: string
}

export interface PlayerContext {
  currentSong?: {
    name: string
    artists: string[]
  }
  playing: boolean
  volume: number
  muted: boolean
  playMode: string
}

export interface ToolCall {
  id: string
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export interface ChatResult {
  content?: string
  toolCalls?: ToolCall[]
}

export type AiDialogueStatus = 'idle' | 'loading' | 'error'
```

- [ ] **Step 2: 创建工具定义 `toolDefinitions.ts`**

```ts
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

export const PLAYER_TOOLS: ToolDefinition[] = [
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
```

- [ ] **Step 3: 创建命令映射 `commandMapper.ts`**

```ts
import { COMMANDS } from '@/core/commands/commands'
import type { ToolCall } from './types'

export type CommandExecution = {
  commandId: string
  payload?: Record<string, unknown>
}

const PLAY_MODE_MAP: Record<string, number> = {
  sequential: 0,
  random: 1,
  singleLoop: 2,
  listLoop: 3
}

export function mapToolCallToCommand(toolCall: ToolCall): CommandExecution | null {
  const name = toolCall.function?.name
  const args = toolCall.function?.arguments ?? {}

  switch (name) {
    case 'player_playPause':
      return { commandId: COMMANDS.PLAYER_TOGGLE_PLAY }
    case 'player_next':
      return { commandId: COMMANDS.PLAYER_PLAY_NEXT }
    case 'player_prev':
      return { commandId: COMMANDS.PLAYER_PLAY_PREV }
    case 'player_setVolume': {
      const volume = Number(args.volume)
      if (!Number.isFinite(volume)) return null
      return { commandId: COMMANDS.PLAYER_SET_VOLUME, payload: { volume } }
    }
    case 'player_setMute': {
      if (typeof args.muted !== 'boolean') return null
      return { commandId: COMMANDS.PLAYER_SET_MUTE, payload: { muted: args.muted } }
    }
    case 'player_setPlayMode': {
      const mode = typeof args.mode === 'string' ? PLAY_MODE_MAP[args.mode] : undefined
      if (mode === undefined) return null
      return { commandId: COMMANDS.PLAYER_SET_PLAY_MODE, payload: { mode } }
    }
    case 'player_searchAndPlay': {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) return null
      return { commandId: COMMANDS.PLAYER_SEARCH_AND_PLAY, payload: { query } }
    }
    default:
      return null
  }
}
```

- [ ] **Step 4: 创建 `useAiDialogue.ts` 核心 hook**

```ts
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/store/playerStore'
import { services } from '@/services'
import { COMMANDS } from '@/core/commands/commands'
import { usePlatformService } from '@/platform'
import type { ChatMessage, PlayerContext, ChatResult, AiDialogueStatus } from './types'
import { mapToolCallToCommand } from './commandMapper'

const AI_ASSISTANT_PLUGIN_ID = 'ai-assistant'

export function useAiDialogue() {
  const playerStore = usePlayerStore()
  const platformService = usePlatformService()
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

      // Optional: feed tool results back to LLM for natural language summary
      // await summarizeToolResults(toolResults)
      return
    }

    messages.value.push({ role: 'assistant', content: '收到，但我不知道该做什么。' })
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
```

> 注：如果 `services.commands()` 返回类型不包含 `execute(id, payload)` 的 payload 参数签名，需要以实际类型为准。

- [ ] **Step 5: 编写命令映射单元测试**

```ts
import { describe, it, expect } from 'vitest'
import { mapToolCallToCommand } from '@/extensions/ai-dialogue/commandMapper'
import { COMMANDS } from '@/core/commands/commands'

describe('commandMapper', () => {
  it('maps player_playPause', () => {
    const result = mapToolCallToCommand({
      id: '1',
      function: { name: 'player_playPause', arguments: {} }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_TOGGLE_PLAY })
  })

  it('maps player_setVolume', () => {
    const result = mapToolCallToCommand({
      id: '2',
      function: { name: 'player_setVolume', arguments: { volume: 0.5 } }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_SET_VOLUME, payload: { volume: 0.5 } })
  })

  it('maps player_setPlayMode', () => {
    const result = mapToolCallToCommand({
      id: '3',
      function: { name: 'player_setPlayMode', arguments: { mode: 'random' } }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_SET_PLAY_MODE, payload: { mode: 1 } })
  })

  it('maps player_searchAndPlay', () => {
    const result = mapToolCallToCommand({
      id: '4',
      function: { name: 'player_searchAndPlay', arguments: { query: '晴天 周杰伦' } }
    })
    expect(result).toEqual({
      commandId: COMMANDS.PLAYER_SEARCH_AND_PLAY,
      payload: { query: '晴天 周杰伦' }
    })
  })

  it('returns null for unknown tool', () => {
    const result = mapToolCallToCommand({
      id: '5',
      function: { name: 'player_unknown', arguments: {} }
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 6: 运行测试**

Run: `npm run test:run -- tests/extensions/ai-dialogue/commandMapper.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/extensions/ai-dialogue/ tests/extensions/ai-dialogue/
git commit --no-verify -m "feat(extension): add ai-dialogue core logic and command mapping"
```

---

## Task 4: 创建 AI 对话 UI 组件

**Files:**

- Create: `src/extensions/ai-dialogue/AiDialogueButton.vue`
- Create: `src/extensions/ai-dialogue/AiDialoguePanel.vue`
- Modify: `src/extensions/ai-dialogue/index.ts`

- [ ] **Step 1: 创建 `AiDialogueButton.vue`**

```vue
<template>
  <button
    v-if="isElectron"
    class="ai-dialogue-button"
    :class="{ active: isOpen }"
    @click="emit('toggle')"
    aria-label="AI 助手"
  >
    <span class="ai-dialogue-button__icon">AI</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean
  isElectron: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<style scoped>
.ai-dialogue-button {
  position: fixed;
  right: 24px;
  bottom: 100px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.ai-dialogue-button.active {
  background: var(--primary-color-active, #2563eb);
}

.ai-dialogue-button__icon {
  font-size: 14px;
  font-weight: 600;
}
</style>
```

- [ ] **Step 2: 创建 `AiDialoguePanel.vue`**

```vue
<template>
  <div v-if="isOpen" class="ai-dialogue-panel" :style="panelStyle" @mousedown="startDrag">
    <div class="ai-dialogue-panel__header">
      <span>AI 助手</span>
      <button @click="emit('close')" aria-label="关闭">×</button>
    </div>
    <div class="ai-dialogue-panel__messages" ref="messagesRef">
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="ai-dialogue-message"
        :class="`ai-dialogue-message--${message.role}`"
      >
        {{ message.content }}
      </div>
      <div v-if="status === 'loading'" class="ai-dialogue-message ai-dialogue-message--loading">
        思考中...
      </div>
      <div v-if="error" class="ai-dialogue-message ai-dialogue-message--error">
        {{ error }}
      </div>
    </div>
    <div class="ai-dialogue-panel__input">
      <input
        v-model="inputText"
        type="text"
        placeholder="试试说：播放下一首、音量调到 50%、播放晴天"
        @keydown.enter="send"
        :disabled="status === 'loading'"
      />
      <button @click="send" :disabled="status === 'loading' || !inputText.trim()">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ChatMessage, AiDialogueStatus } from './types'

const props = defineProps<{
  isOpen: boolean
  messages: ChatMessage[]
  status: AiDialogueStatus
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  send: [content: string]
}>()

const inputText = ref('')
const messagesRef = ref<HTMLElement>()
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

const panelStyle = computed(() => ({
  transform: `translate(${position.value.x}px, ${position.value.y}px)`
}))

watch(
  () => props.messages,
  () => {
    nextTick(() => {
      const el = messagesRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
  { deep: true }
)

function startDrag(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.ai-dialogue-panel__input')) return

  isDragging.value = true
  dragOffset.value = {
    x: event.clientX - position.value.x,
    y: event.clientY - position.value.y
  }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value) return
  position.value = {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

function send() {
  const text = inputText.value.trim()
  if (!text) return
  emit('send', text)
  inputText.value = ''
}
</script>

<style scoped>
.ai-dialogue-panel {
  position: fixed;
  right: 24px;
  bottom: 160px;
  width: 360px;
  height: 480px;
  background: var(--panel-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  z-index: 1001;
}

.ai-dialogue-panel__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}

.ai-dialogue-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-dialogue-message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.ai-dialogue-message--user {
  align-self: flex-end;
  background: var(--primary-color, #3b82f6);
  color: white;
}

.ai-dialogue-message--assistant {
  align-self: flex-start;
  background: var(--message-bg, #f3f4f6);
}

.ai-dialogue-message--loading {
  align-self: flex-start;
  color: var(--text-secondary, #6b7280);
}

.ai-dialogue-message--error {
  align-self: flex-start;
  color: #dc2626;
  background: #fee2e2;
}

.ai-dialogue-panel__input {
  padding: 12px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  gap: 8px;
}

.ai-dialogue-panel__input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  outline: none;
}

.ai-dialogue-panel__input button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
}
</style>
```

- [ ] **Step 3: 创建扩展入口 `index.ts`**

```ts
import { ref } from 'vue'
import { useAiDialogue } from './useAiDialogue'
import AiDialogueButton from './AiDialogueButton.vue'
import AiDialoguePanel from './AiDialoguePanel.vue'

export function useAiDialogueExtension() {
  const { messages, status, error, isElectron, sendMessage, clearMessages } = useAiDialogue()
  const isOpen = ref(false)

  function toggle() {
    isOpen.value = !isOpen.value
    if (!isOpen.value) {
      clearMessages()
    }
  }

  function close() {
    isOpen.value = false
  }

  async function send(content: string) {
    await sendMessage(content)
  }

  return {
    isOpen,
    isElectron,
    messages,
    status,
    error,
    toggle,
    close,
    send
  }
}

export { AiDialogueButton, AiDialoguePanel }
```

- [ ] **Step 4: 提交 UI 组件**

```bash
git add src/extensions/ai-dialogue/
git commit --no-verify -m "feat(ui): add draggable AI dialogue floating panel"
```

---

## Task 5: 在播放器主界面集成悬浮窗

**Files:**

- Modify: `src/App.vue`（或播放器主页面组件，如 `src/views/PlayerView.vue`）

- [ ] **Step 1: 找到播放器主页面组件**

先确认主播放器页面的路径：

Run: `git grep -n "PlayerView" src/App.vue src/router/index.ts src/views/*.vue`

假设主页面为 `src/App.vue`：

```vue
<template>
  <div class="app">
    <router-view />
    <AiDialogueButton
      :is-open="aiDialogue.isOpen"
      :is-electron="aiDialogue.isElectron"
      @toggle="aiDialogue.toggle"
    />
    <AiDialoguePanel
      :is-open="aiDialogue.isOpen"
      :messages="aiDialogue.messages"
      :status="aiDialogue.status"
      :error="aiDialogue.error"
      @close="aiDialogue.close"
      @send="aiDialogue.send"
    />
  </div>
</template>

<script setup lang="ts">
import { AiDialogueButton, AiDialoguePanel, useAiDialogueExtension } from '@/extensions/ai-dialogue'

const aiDialogue = useAiDialogueExtension()
</script>
```

- [ ] **Step 2: 运行开发服务器验证**

Run: `npm run dev:electron`
Expected: Electron 窗口打开，播放器右下角出现 AI 按钮，点击展开对话窗。

- [ ] **Step 3: 提交**

```bash
git add src/App.vue
git commit --no-verify -m "feat(app): integrate AI dialogue floating panel into player"
```

---

## Task 6: 端到端测试与配置验证

- [ ] **Step 1: 安装/启用插件**

1. 打开 Electron 应用，进入插件管理页面
2. 选择从路径安装，定位到 `plugins/third-party/ai-assistant`
3. 启用插件
4. 在插件设置中填入：
   - LLM API Key：`<YOUR_DEEPSEEK_API_KEY>`
   - API 基础地址：`https://api.deepseek.com/v1`
   - 模型名：`deepseek-chat`

- [ ] **Step 2: 验证基础控制指令**

在悬浮窗输入并验证：

- "播放下一首" → 执行 `PLAYER_PLAY_NEXT`
- "暂停" → 执行 `PLAYER_TOGGLE_PLAY`
- "音量调到 30%" → 执行 `PLAYER_SET_VOLUME`
- "播放周杰伦的晴天" → 执行 `PLAYER_SEARCH_AND_PLAY`

- [ ] **Step 3: 运行完整测试套件**

Run: `npm run test:run`
Expected: 新增测试通过，现有测试无回归。

- [ ] **Step 4: 运行 lint 和 typecheck**

Run: `npm run lint`
Run: `npm run typecheck`
Expected: 无新增错误。

- [ ] **Step 5: 提交最终调整**

```bash
git add .
git commit --no-verify -m "feat: complete AI dialogue player control integration"
```

---

## 已知限制与后续扩展

- **Electron 限定**：外部插件调用依赖主进程 bridge（`window.services.plugins`），因此 `ai-dialogue` 扩展在 Web 端不会渲染。后续如果要支持 Web，可以把 LLM 调用逻辑内嵌到渲染进程，绕过插件 Worker。
- **搜索范围**：`PLAYER_SEARCH_AND_PLAY` 默认使用当前激活的搜索平台。后续可扩展为让 AI 指定平台。
- **Tool result 回传**：当前直接把 `content` 展示给用户。更完整的方案是把每个 tool 的执行结果作为 `tool` 角色消息再次调用 `chat`，让 LLM 生成自然语言总结。

---

## 自我审查

- [x] 每个设计需求都有对应任务：CommandService 扩展、插件、内置扩展、UI、集成、测试。
- [x] 计划中没有 TBD/TODO/placeholder。
- [x] 类型和命令 ID 在全文中一致（`COMMANDS.PLAYER_SET_VOLUME` 等）。
- [x] 文件路径使用项目实际路径（`src/extensions/ai-dialogue/`、`plugins/third-party/ai-assistant/`）。
- [x] 每步包含可执行的命令和期望结果。
