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
