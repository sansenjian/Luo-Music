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
