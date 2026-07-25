/**
 * 黑话系统 - 数据管理与持久化（MaiBot 风格）
 *
 * 核心理念：LLM 自动从对话中提取黑话候选，累进式推断含义，
 * 对话时 LLM 可通过 jargon_query 工具主动查询。
 *
 * 数据存储在 localStorage，key: ai-dialogue:jargons
 */

import { ref, watch, type Ref } from 'vue'
import { services } from '@/services'

// ========== 类型定义 ==========

export interface JargonEntry {
  id: string
  /** 黑话词条，如 "周董" */
  content: string
  /** 推断出的含义，如 "指周杰伦，华语流行歌手" */
  meaning: string
  /** 累计出现次数 */
  count: number
  /** null=未判定, true=确认为黑话, false=非黑话 */
  isJargon: boolean | null
  /** 推断是否完成（达到最大阈值后不再推断） */
  isComplete: boolean
  /** 出现该词的上下文片段（最多保留 5 条） */
  context: string[]
  /** 上次推断时的 count 值 */
  lastInferenceCount: number
  createdAt: number
  updatedAt: number
}

// ========== 存储 ==========

const STORAGE_KEY = 'ai-dialogue:jargons'
/** 最多保留的黑话条目数，防止长期累积撑爆 localStorage 和拖慢查找 */
const MAX_JARGON_ENTRIES = 500

function loadJargons(): JargonEntry[] {
  try {
    const raw = services.storage().getJSON<JargonEntry[]>(STORAGE_KEY) ?? []
    return raw.slice(-MAX_JARGON_ENTRIES)
  } catch {
    return []
  }
}

function saveJargons(entries: JargonEntry[]): void {
  try {
    services.storage().setJSON(STORAGE_KEY, entries)
  } catch {
    // 忽略写入失败
  }
}

// ========== 唯一 ID 生成 ==========

let idCounter = Date.now()
function generateId(): string {
  return `jargon_${(idCounter++).toString(36)}`
}

// ========== 累进阈值 ==========

/** count 达到这些值时触发推断 */
export const INFERENCE_THRESHOLDS = [3, 8, 20] as const
/** 达到此值后标记为完成，不再推断 */
export const COMPLETE_THRESHOLD = 20

// ========== Composable（单例模式，确保跨组件共享状态） ==========

interface JargonStore {
  jargons: Ref<JargonEntry[]>
  upsertJargon: (content: string, contextSnippet: string) => JargonEntry
  updateMeaning: (id: string, meaning: string, isJargon: boolean) => boolean
  setMeaning: (id: string, meaning: string) => boolean
  markComplete: (id: string) => boolean
  markInferred: (id: string, count: number) => boolean
  removeJargon: (id: string) => boolean
  findByContent: (content: string) => JargonEntry | undefined
  shouldInfer: (entry: JargonEntry) => boolean
  queryJargons: (words: string[]) => Array<{
    word: string
    found: boolean
    meaning: string
    isJargon: boolean | null
  }>
  buildJargonPrompt: () => string
  getStats: () => { total: number; confirmed: number; rejected: number; pending: number }
}

let storeInstance: JargonStore | null = null

function createStore(): JargonStore {
  const jargons = ref<JargonEntry[]>(loadJargons())

  // 自动持久化
  watch(jargons, entries => saveJargons(entries), { deep: true })

  /** 淘汰优先级最低的词条，保持条目数在上限内 */
  function evictLowPriorityJargons(): void {
    // 优先保留：已确认为黑话 > 未判定 > 确认非黑话；同优先级按 count 降序保留
    const priority = (e: JargonEntry): number => {
      if (e.isJargon === true) return 3
      if (e.isJargon === null) return 2
      return 1
    }
    jargons.value.sort((a, b) => priority(b) - priority(a) || b.count - a.count)
    jargons.value = jargons.value.slice(0, MAX_JARGON_ENTRIES)
  }

  /** 添加或更新黑话候选（提取到已有词时 count+1） */
  function upsertJargon(content: string, contextSnippet: string): JargonEntry {
    const trimmed = content.trim()
    if (!trimmed) throw new Error('黑话内容不能为空')

    const existing = jargons.value.find(j => j.content === trimmed)
    if (existing) {
      existing.count++
      existing.updatedAt = Date.now()
      // 追加上下文（保留最近 5 条）
      if (contextSnippet && !existing.context.includes(contextSnippet)) {
        existing.context.push(contextSnippet)
        if (existing.context.length > 5) {
          existing.context.shift()
        }
      }
      return existing
    }

    const now = Date.now()
    const newEntry: JargonEntry = {
      id: generateId(),
      content: trimmed,
      meaning: '',
      count: 1,
      isJargon: null,
      isComplete: false,
      context: contextSnippet ? [contextSnippet] : [],
      lastInferenceCount: 0,
      createdAt: now,
      updatedAt: now
    }
    jargons.value.push(newEntry)

    // 超过上限时淘汰最低 count 且未确认为黑话的词条
    if (jargons.value.length > MAX_JARGON_ENTRIES) {
      evictLowPriorityJargons()
    }

    return newEntry
  }

  /** 更新黑话含义 */
  function updateMeaning(id: string, meaning: string, isJargon: boolean): boolean {
    const entry = jargons.value.find(j => j.id === id)
    if (!entry) return false
    entry.meaning = meaning
    entry.isJargon = isJargon
    entry.updatedAt = Date.now()
    return true
  }

  /** 手动设置含义（用户在 UI 中编辑） */
  function setMeaning(id: string, meaning: string): boolean {
    const entry = jargons.value.find(j => j.id === id)
    if (!entry) return false
    entry.meaning = meaning
    entry.isJargon = meaning.trim() ? true : null
    entry.isComplete = true
    entry.updatedAt = Date.now()
    return true
  }

  /** 标记完成状态 */
  function markComplete(id: string): boolean {
    const entry = jargons.value.find(j => j.id === id)
    if (!entry) return false
    entry.isComplete = true
    entry.updatedAt = Date.now()
    return true
  }

  /** 删除黑话 */
  function removeJargon(id: string): boolean {
    const idx = jargons.value.findIndex(j => j.id === id)
    if (idx === -1) return false
    jargons.value.splice(idx, 1)
    return true
  }

  /** 根据词条查找 */
  function findByContent(content: string): JargonEntry | undefined {
    return jargons.value.find(j => j.content === content.trim())
  }

  /** 判断是否需要触发推断 */
  function shouldInfer(entry: JargonEntry): boolean {
    if (entry.isComplete) return false
    return INFERENCE_THRESHOLDS.some(t => entry.count >= t && entry.lastInferenceCount < t)
  }

  /** 记录已推断 */
  function markInferred(id: string, count: number): boolean {
    const entry = jargons.value.find(j => j.id === id)
    if (!entry) return false
    entry.lastInferenceCount = count
    if (count >= COMPLETE_THRESHOLD) {
      entry.isComplete = true
    }
    entry.updatedAt = Date.now()
    return true
  }

  /** 查询黑话（供 jargon_query 工具使用） */
  function queryJargons(words: string[]): Array<{
    word: string
    found: boolean
    meaning: string
    isJargon: boolean | null
  }> {
    return words.map(word => {
      const entry = findByContent(word)
      return {
        word,
        found: !!entry,
        meaning: entry?.meaning ?? '',
        isJargon: entry?.isJargon ?? null
      }
    })
  }

  /** 构建系统提示词中的黑话说明段落（仅注入已确认的黑话） */
  function buildJargonPrompt(): string {
    const confirmed = jargons.value.filter(j => j.isJargon === true && j.meaning)
    if (confirmed.length === 0) return ''

    const lines: string[] = ['【用户黑话词典】以下是用户常用黑话及其含义，遇到时请直接理解：']
    for (const j of confirmed) {
      lines.push(`- "${j.content}" = ${j.meaning}`)
    }
    lines.push('如果遇到不确定的词，可以调用 jargon_query 工具查询。')
    return lines.join('\n')
  }

  /** 统计信息 */
  function getStats() {
    const total = jargons.value.length
    const confirmed = jargons.value.filter(j => j.isJargon === true).length
    const rejected = jargons.value.filter(j => j.isJargon === false).length
    const pending = jargons.value.filter(j => j.isJargon === null).length
    return { total, confirmed, rejected, pending }
  }

  return {
    jargons,
    upsertJargon,
    updateMeaning,
    setMeaning,
    markComplete,
    markInferred,
    removeJargon,
    findByContent,
    shouldInfer,
    queryJargons,
    buildJargonPrompt,
    getStats
  }
}

export function useJargonStore(): JargonStore {
  if (!storeInstance) {
    storeInstance = createStore()
  }
  return storeInstance
}
