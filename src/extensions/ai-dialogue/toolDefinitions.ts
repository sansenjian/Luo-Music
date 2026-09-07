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

/**
 * 平台工具 - AI 可直接调用音乐平台插件的能力
 */
export const PLATFORM_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'platform_search',
      description: '在指定音乐平台搜索歌曲，返回搜索结果列表（不自动播放）',
      parameters: {
        type: 'object',
        properties: {
          platformId: {
            type: 'string',
            enum: ['netease', 'qq'],
            description: '音乐平台 ID'
          },
          keyword: { type: 'string', description: '搜索关键词（歌曲名、歌手等）' },
          limit: { type: 'number', description: '返回数量，默认 10' }
        },
        required: ['platformId', 'keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'platform_getLyric',
      description: '获取指定歌曲的歌词',
      parameters: {
        type: 'object',
        properties: {
          platformId: {
            type: 'string',
            enum: ['netease', 'qq'],
            description: '音乐平台 ID'
          },
          songId: { type: 'string', description: '歌曲 ID（从搜索结果获取）' }
        },
        required: ['platformId', 'songId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'platform_getPlaylistDetail',
      description: '获取指定歌单的详情和歌曲列表',
      parameters: {
        type: 'object',
        properties: {
          platformId: {
            type: 'string',
            enum: ['netease', 'qq'],
            description: '音乐平台 ID'
          },
          playlistId: { type: 'string', description: '歌单 ID' }
        },
        required: ['platformId', 'playlistId']
      }
    }
  }
]

/**
 * 黑话工具 - 让 LLM 在对话中主动查询用户黑话词典
 */
export const JARGON_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'jargon_query',
      description:
        '查询用户黑话词典，获取用户自定义词汇/昵称/俚语的含义。当用户使用了你不确定的词时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          words: {
            type: 'array',
            items: { type: 'string' },
            description: '要查询的黑话词条列表'
          }
        },
        required: ['words']
      }
    }
  }
]

export const ALL_TOOLS: ToolDefinition[] = [...PLAYER_TOOLS, ...PLATFORM_TOOLS, ...JARGON_TOOLS]
