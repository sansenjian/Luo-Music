/**
 * 请求键生成器
 * 用于生成唯一的请求标识符
 */

import type { AxiosRequestConfig } from 'axios'

/**
 * 生成请求键
 * @param config - Axios 请求配置
 * @returns 请求键
 */
export function generateRequestKey(config: AxiosRequestConfig): string {
  const { url, method, params, data } = config
  return `${method?.toUpperCase() || 'UNKNOWN'}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`
}

/**
 * 生成缓存键 (简化版)
 * @param config - Axios 请求配置
 * @returns 缓存键
 */
export function generateCacheKey(config: AxiosRequestConfig): string {
  const { url, method, params } = config
  return `${method?.toUpperCase() || 'GET'}:${url}:${JSON.stringify(params || {})}`
}

/**
 * 查找 JSON 对象的结束位置
 * @param str - 字符串
 * @param start - 开始位置
 * @returns JSON 对象结束位置的索引
 */
function findJsonObjectEnd(str: string, start: number): number {
  if (str[start] !== '{') return -1
  
  let braceCount = 0
  let inString = false
  let escape = false
  
  for (let i = start; i < str.length; i++) {
    const char = str[i]
    
    if (escape) {
      escape = false
      continue
    }
    
    if (char === '\\') {
      escape = true
      continue
    }
    
    if (char === '"' && !escape) {
      inString = !inString
      continue
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          return i
        }
      }
    }
  }
  
  return -1
}

/**
 * 解析请求键
 * @param key - 请求键
 * @returns 解析后的信息
 */
export function parseRequestKey(key: string): { method: string; url: string; params: Record<string, any>; data: Record<string, any> } {
  if (!key) {
    return { method: 'UNKNOWN', url: '', params: {}, data: {} }
  }
  
  const firstColon = key.indexOf(':')
  if (firstColon === -1) {
    return { method: 'UNKNOWN', url: key, params: {}, data: {} }
  }
  
  const method = key.substring(0, firstColon)
  const rest = key.substring(firstColon + 1)
  
  const secondColon = rest.indexOf(':')
  if (secondColon === -1) {
    return { method, url: rest, params: {}, data: {} }
  }
  
  const url = rest.substring(0, secondColon)
  const remaining = rest.substring(secondColon + 1)
  
  if (!remaining) {
    return { method, url, params: {}, data: {} }
  }
  
  let paramsStr: string
  let dataStr: string
  
  if (remaining[0] === '{') {
    const paramsEnd = findJsonObjectEnd(remaining, 0)
    if (paramsEnd === -1) {
      return { method, url, params: {}, data: {} }
    }
    
    paramsStr = remaining.substring(0, paramsEnd + 1)
    const afterParams = remaining.substring(paramsEnd + 1)
    
    if (afterParams.startsWith(':')) {
      dataStr = afterParams.substring(1)
    } else {
      dataStr = ''
    }
  } else {
    paramsStr = remaining
    dataStr = ''
  }
  
  try {
    return {
      method,
      url,
      params: paramsStr ? JSON.parse(paramsStr) : {},
      data: dataStr ? JSON.parse(dataStr) : {}
    }
  } catch {
    return { method, url, params: {}, data: {} }
  }
}

/**
 * 比较两个请求键是否相同
 * @param config1 - 第一个请求配置
 * @param config2 - 第二个请求配置
 * @returns 是否相同
 */
export function isSameRequest(config1: AxiosRequestConfig, config2: AxiosRequestConfig): boolean {
  return generateRequestKey(config1) === generateRequestKey(config2)
}

/**
 * 批量生成请求键
 * @param configs - 请求配置数组
 * @returns 请求键数组
 */
export function generateRequestKeys(configs: AxiosRequestConfig[]): string[] {
  return configs.map(config => generateRequestKey(config))
}

export default {
  generateRequestKey,
  generateCacheKey,
  parseRequestKey,
  isSameRequest,
  generateRequestKeys
}
