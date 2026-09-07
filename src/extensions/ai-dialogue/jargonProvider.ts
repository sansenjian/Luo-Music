/**
 * 黑话系统 - 播放器接口定义（插件契约）
 *
 * 播放器只定义接口，具体实现由插件提供。
 * 内置插件位于 plugins/built-in/jargon-learner/index.ts
 * 第三方插件可通过实现此接口替换学习算法。
 */

import type { ChatMessage } from './types'
import type { JargonEntry } from './jargonStore'

// ========== LLM 调用器（由播放器注入，插件不直接持有 API 配置） ==========

export interface JargonLlmCaller {
  /**
   * 不带 tools 的原始 LLM 调用，返回纯文本。
   * 播放器负责注入 API Key / endpoint / IPC 代理。
   */
  callRaw(messages: Array<{ role: string; content: string }>, temperature?: number): Promise<string>
}

// ========== 插件输入输出 ==========

export interface JargonExtractInput {
  /** 最近对话消息 */
  messages: ChatMessage[]
  /** LLM 调用器（由播放器注入） */
  llm: JargonLlmCaller
}

export interface JargonExtractItem {
  content: string
  context: string
}

export interface JargonExtractResult {
  jargons: JargonExtractItem[]
}

export interface JargonInferInput {
  /** 待推断的黑话条目（含上下文、出现次数等） */
  entry: JargonEntry
  /** LLM 调用器 */
  llm: JargonLlmCaller
}

export interface JargonInferResult {
  isJargon: boolean
  meaning: string
}

// ========== 核心接口 ==========

export interface JargonProvider {
  /** 提取阶段：从对话中提取疑似黑话候选 */
  extract(input: JargonExtractInput): Promise<JargonExtractResult>

  /** 推断阶段：基于上下文推断黑话含义 */
  infer(input: JargonInferInput): Promise<JargonInferResult>
}
