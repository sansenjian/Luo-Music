/**
 * LLM 响应解析工具
 *
 * 统一处理 LLM 返回的 JSON 文本解析：
 * - 剥离 markdown 代码块包裹
 * - JSON.parse + 类型安全降级
 */

/**
 * 从 LLM 响应中提取 JSON。
 * 自动处理 markdown 代码块包裹（```json ... ```）。
 * 解析失败时返回 null，不抛异常。
 */
export function extractJsonFromLlmResponse<T>(raw: string): T | null {
  let jsonStr = raw.trim()

  // 剥离 markdown 代码块
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  try {
    return JSON.parse(jsonStr) as T
  } catch {
    return null
  }
}
