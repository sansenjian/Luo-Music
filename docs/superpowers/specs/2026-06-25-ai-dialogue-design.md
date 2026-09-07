# AI 对话控制播放器插件设计

## 1. 背景与目标

为 LUO Music 增加一个“AI 对话控制播放器”功能：

- 用户在播放器界面打开一个可拖拽的悬浮对话窗；
- 用自然语言与 AI 交流；
- AI 根据用户意图调用播放器命令（播放/暂停、切歌、调音量、搜索并播放等）。

本设计遵循项目现有插件化架构，将 LLM 相关逻辑隔离在外部插件 Worker 中，UI 与命令分发放在渲染进程的内置扩展里。

## 2. 设计决策摘要

| 决策项 | 选择 | 原因 |
| --- | --- | --- |
| AI 能力来源 | 用户自配置第三方 LLM API | 最灵活，不绑定特定模型，符合现有插件可配置设计 |
| 插件形态 | 外部插件（Worker）+ 内置扩展 | Worker 隔离 LLM 配置与调用；内置扩展负责 UI 和播放器命令，响应快 |
| 交互方式 | 可拖拽悬浮对话小窗 | 轻量，不打扰主界面 |
| 语义解析方案 | Function Calling / Tools | 结构化、可扩展、错误率低 |
| 第一阶段控制范围 | 基础播放控制 + 搜索并播放指定歌曲 | 足够展示价值，避免 LLM 解析过于复杂 |

## 3. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                     渲染进程 (Renderer)                      │
│  ┌─────────────────────┐      ┌──────────────────────────┐  │
│  │  AiDialogue 悬浮窗   │──────▶│  useAiDialogue Hook      │  │
│  │  (Vue 组件)          │      │  - 维护消息列表           │  │
│  └─────────────────────┘      │  - 采集播放器上下文       │  │
│                               │  - 调用插件解析           │  │
│                               │  - 执行命令并展示结果     │  │
│                               └──────────┬───────────────┘  │
│                                          │                  │
│                               ┌──────────▼──────────┐       │
│                               │  CommandService     │       │
│                               │  (COMMANDS.PLAYER_*)│       │
│                               └──────────┬──────────┘       │
│                                          │                  │
└──────────────────────────────────────────┼──────────────────┘
                                           │ PLUGIN_CALL
┌──────────────────────────────────────────┼──────────────────┐
│                     插件 Worker           │                  │
│                               ┌──────────▼──────────┐       │
│                               │  ai-assistant 插件   │       │
│                               │  - LLM 配置管理      │       │
│                               │  - 组装 tools        │       │
│                               │  - 调用 LLM API      │       │
│                               │  - 解析 tool_calls   │       │
│                               └─────────────────────┘       │
│                                                             │
│  外部依赖：用户配置的 OpenAI 兼容 LLM API                    │
└─────────────────────────────────────────────────────────────┘
```

## 4. 外部插件 `ai-assistant`

### 4.1 位置

`plugins/third-party/ai-assistant/`

### 4.2 manifest

```json
{
  "manifestVersion": 2,
  "id": "ai-assistant",
  "name": "AI 播放器助手",
  "version": "1.0.0",
  "runtime": "isolated",
  "category": "extension",
  "contributionsV2": {
    "commands": [
      { "command": "ai.chat", "title": "与 AI 对话" }
    ],
    "panels": [
      { "id": "ai-dialogue", "title": "AI 助手" }
    ]
  }
}
```

### 4.3 配置项

通过插件 settings 暴露以下配置：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | string | "" | LLM API Key |
| `baseUrl` | string | "https://api.openai.com/v1" | API 基础地址 |
| `model` | string | "gpt-4o-mini" | 模型名 |
| `temperature` | number | 0.3 | 采样温度，控制创意程度 |
| `maxHistory` | number | 10 | 保留的最大对话轮数 |

### 4.4 暴露方法

插件向渲染进程暴露一个方法：

```ts
async chat(
  messages: ChatMessage[],
  context: PlayerContext
): Promise<ChatResult>
```

类型定义：

```ts
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface PlayerContext {
  currentSong?: { name: string; artists: string[] };
  playing: boolean;
  volume: number;
  muted: boolean;
  playMode: string;
}

interface ChatResult {
  content?: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}
```

### 4.5 内部实现

1. 从插件 storage 读取 LLM 配置；
2. 拼接 system prompt，说明当前支持的播放器工具及调用规则；
3. 把 `messages` 和 `tools` 数组发送给 `/chat/completions`；
4. 解析响应中的 `tool_calls`，和可选的普通文本 `content` 一起返回。

## 5. 内置扩展 `ai-dialogue`

### 5.1 位置

`src/extensions/ai-dialogue/`

### 5.2 核心文件

```text
src/extensions/ai-dialogue/
├── AiDialogueButton.vue      # 悬浮触发按钮
├── AiDialoguePanel.vue       # 可拖拽对话窗
├── useAiDialogue.ts          # 对话逻辑 Hook
├── commandMapper.ts          # tool_call → COMMANDS 映射
├── toolDefinitions.ts        # 工具描述（同步给插件）
└── index.ts                  # 扩展注册入口
```

### 5.3 职责

- 在播放器界面渲染悬浮按钮，点击展开可拖拽对话窗；
- 维护消息列表和加载状态；
- 发送消息前采集当前播放器上下文；
- 通过 `services.plugins().call('ai-assistant', 'chat', ...)` 调用插件；
- 根据返回的 `toolCalls` 调用 `services.commands().execute(...)`；
- 把命令执行结果带回给插件生成自然语言回复；
- 未配置 API key 时展示引导提示。

### 5.4 命令映射

| tool 名称 | 对应命令 | 参数 |
| --- | --- | --- |
| `player_playPause` | `COMMANDS.PLAYER_TOGGLE_PLAY` | - |
| `player_next` | `COMMANDS.PLAYER_PLAY_NEXT` | - |
| `player_prev` | `COMMANDS.PLAYER_PLAY_PREV` | - |
| `player_setVolume` | `COMMANDS.PLAYER_SET_VOLUME` | `{ volume: number }` |
| `player_setMute` | `COMMANDS.PLAYER_SET_MUTE` | `{ muted: boolean }` |
| `player_setPlayMode` | `COMMANDS.PLAYER_SET_PLAY_MODE` | `{ mode: PlayMode }` |
| `player_searchAndPlay` | `COMMANDS.PLAYER_SEARCH_AND_PLAY` | `{ query: string }` |

为了支持带参数的精确控制，本设计会在 `src/core/commands/commands.ts` 和 `src/services/commandService.ts` 中新增以下命令：

- `PLAYER_SET_VOLUME`：直接设置音量到指定值（0.0 ~ 1.0），内部调用 `playerStore.setVolume`
- `PLAYER_SET_MUTE`：直接设置静音状态，内部根据目标状态和当前状态调用 `playerStore.toggleMute`
- `PLAYER_SET_PLAY_MODE`：直接设置播放模式，内部调用 `playerStore.setPlayMode`
- `PLAYER_SEARCH_AND_PLAY`：根据关键词搜索歌曲并直接播放，内部先调用搜索 API，再调用 `playerStore.playSong`

这样所有播放器控制都统一走 `CommandService`，保持项目“播放器命令单一入口”的约束。

## 6. 数据流

1. 用户在悬浮窗输入文字并发送；
2. `useAiDialogue` 追加用户消息，并通过 `playerStore` 采集当前播放上下文；
3. 调用 `services.plugins().call('ai-assistant', 'chat', messages, context)`；
4. 插件 Worker 读取配置，调用 LLM API；
5. LLM 返回 `tool_calls` 或普通文本；
6. 插件把结果返回给渲染进程；
7. 渲染进程根据 `toolCalls` 依次执行对应命令；
8. 把执行结果（成功/失败/无结果）以 `tool` 消息回传给插件，请求生成自然语言回复；
9. UI 展示 AI 的最终回复。

## 7. 工具（Function）定义

插件和内置扩展共享同一份工具描述。以下是第一阶段支持的函数定义：

```ts
const tools = [
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
      description: '设置播放器音量',
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
      description: '切换静音状态',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'player_setPlayMode',
      description: '切换播放模式',
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
];
```

## 8. 错误处理

| 错误场景 | 处理策略 |
| --- | --- |
| API key 未配置 | 悬浮窗首次打开时展示配置引导，提供跳转插件设置的入口 |
| LLM API 请求失败 | 在对话中展示错误信息，保留用户消息，支持重试 |
| LLM 返回无法识别的 tool | 记录警告，向用户回复“我还不会这个操作” |
| tool 参数缺失/非法 | 跳过该 tool，向用户说明无法理解 |
| 命令执行失败（如搜索无结果） | 把失败原因作为 tool result 回传，让 LLM 生成解释 |
| 网络超时 | 默认 30 秒超时，超时后提示用户检查网络或 API 可用性 |

## 9. 配置与隐私

- API key、baseUrl、模型名仅保存在插件自己的隔离 storage 中，不进入主程序配置；
- 对话历史默认保留在内存中，页面刷新后清空；可在插件设置中开启本地持久化；
- 除用户自己配置的 LLM API 外，不会把播放记录或对话内容发送到其他服务端；
- 插件 manifest 中明确声明 `category: 'extension'`，不参与音乐数据源加载。

## 10. 测试策略

| 测试类型 | 内容 |
| --- | --- |
| 单元测试 | `commandMapper.ts` 的输入输出；`toolDefinitions.ts` 的 schema 有效性 |
| 插件 Worker 测试 | mock `fetch`，验证不同用户输入下返回的 tool_calls 是否正确 |
| 集成测试 | 验证悬浮窗 → 插件调用 → 命令执行的完整链路 |
| UI 测试 | 悬浮按钮展开/收起、拖拽、消息渲染、加载状态 |

## 11. 后续扩展

- 支持更多命令：查看当前列表、清空列表、切换到指定序号歌曲、添加到下一首；
- 支持 Agent Loop，让 LLM 可以分多步完成复杂任务；
- 支持语音输入（Web Speech API）；
- 支持自定义 system prompt 和工具集；
- 支持本地模型（transformers.js / ollama）。
