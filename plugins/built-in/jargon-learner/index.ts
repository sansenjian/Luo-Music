/**
 * 内置黑话学习插件 — LLM 自动提取与推断实现
 *
 * 这是播放器黑话系统的具体实现插件。
 * 播放器只定义 JargonProvider 接口，本插件提供实际算法：
 * - 提取阶段：LLM 从对话中识别疑似黑话候选
 * - 推断阶段：LLM 基于上下文推断词条含义，判断是否为黑话
 *
 * 第三方可通过实现 JargonProvider 接口替换此实现。
 */

import type {
  JargonProvider,
  JargonExtractInput,
  JargonExtractResult,
  JargonInferInput,
  JargonInferResult
} from '@/extensions/ai-dialogue/jargonProvider'
import type { JargonEntry } from '@/extensions/ai-dialogue/jargonStore'
import type { ChatMessage } from '@/extensions/ai-dialogue/types'
import { extractJsonFromLlmResponse } from '@/extensions/ai-dialogue/llmUtils'

// ========== 提取阶段 ==========

function buildExtractPrompt(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  const dialogue = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n')

  const system = `你是一个黑话识别助手。请从以下音乐播放器对话中提取疑似黑话/俚语/缩写/昵称。

黑话定义：用户使用的不常见口语表达，包括但不限于：
- 歌手/乐队的昵称或缩写（如"周董"="周杰伦"、"JJ"="林俊杰"）
- 歌曲名的简称或变体
- 播放器操作的俚语（如"切歌"="下一首"、"炸裂"="很大声"）
- 网络用语/音乐圈黑话

不要提取以下内容：
- 常见词汇和标准表达
- 工具名称（如 player_next 等）
- 数字（如"1"、"2"）

请以 JSON 数组格式返回，每个元素包含：
- content: 黑话词条
- context: 该词出现的完整句子

返回格式示例：
[{"content": "周董", "context": "帮我播周董的歌"}, {"content": "切歌", "context": "切歌吧这首不好听"}]

如果没有黑话，返回 []。只返回 JSON，不要其他文字。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: dialogue }
  ]
}

function parseExtractedJargons(raw: string): JargonExtractResult {
  const parsed = extractJsonFromLlmResponse<unknown[]>(raw)
  if (!Array.isArray(parsed)) return { jargons: [] }
  const jargons = parsed
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== 'object' || item === null) return false
      return typeof item.content === 'string' && item.content.trim().length > 0
    })
    .map(item => ({
      content: String(item.content).trim(),
      context: typeof item.context === 'string' ? item.context.trim() : ''
    }))
  return { jargons }
}

// ========== 推断阶段 ==========

function buildInferPrompt(entry: JargonEntry): Array<{ role: string; content: string }> {
  const contextList =
    entry.context.length > 0
      ? entry.context.map((c, i) => `${i + 1}. "${c}"`).join('\n')
      : '（无上下文记录）'

  const system = `你是一个黑话含义推断助手。请根据以下信息推断黑话的含义。

黑话词条："${entry.content}"
出现次数：${entry.count}
出现上下文：
${contextList}

请判断该词条在音乐播放器场景下是否为黑话，并推断其含义。

返回 JSON 格式：
{
  "is_jargon": true/false,
  "meaning": "含义说明（如果是黑话）或空字符串（如果不是黑话）"
}

判断标准：
- is_jargon=true: 该词确实是不常见表达/昵称/缩写/俚语
- is_jargon=false: 该词是常见词汇，不需要特殊处理

只返回 JSON，不要其他文字。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `请判断："${entry.content}"` }
  ]
}

function parseInferenceResult(raw: string): JargonInferResult {
  const parsed = extractJsonFromLlmResponse<{ is_jargon?: boolean; meaning?: string }>(raw)
  if (!parsed) {
    // 解析失败时，保守处理：认为是黑话，使用原始文本作为含义
    return { isJargon: true, meaning: raw.trim() }
  }
  return {
    isJargon: parsed.is_jargon ?? true,
    meaning: typeof parsed.meaning === 'string' ? parsed.meaning.trim() : ''
  }
}

// ========== JargonProvider 实现 ==========

export const jargonProvider: JargonProvider = {
  async extract(input: JargonExtractInput): Promise<JargonExtractResult> {
    const dialogue = input.messages.filter(m => m.role === 'user' || m.role === 'assistant')
    if (dialogue.length < 2) return { jargons: [] }

    const promptMessages = buildExtractPrompt(dialogue)
    const rawResponse = await input.llm.callRaw(promptMessages, 0.1)
    return parseExtractedJargons(rawResponse)
  },

  async infer(input: JargonInferInput): Promise<JargonInferResult> {
    const promptMessages = buildInferPrompt(input.entry)
    const rawResponse = await input.llm.callRaw(promptMessages, 0.2)
    return parseInferenceResult(rawResponse)
  }
}

export default jargonProvider
