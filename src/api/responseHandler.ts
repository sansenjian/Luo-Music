/**
 * 统一 API 响应处理模块
 * 处理不同平台的响应格式差异
 */

import { z } from 'zod'
import { type SearchValidationResult } from '@/types/schemas'
import { isCanceledRequestError } from '@/utils/http/cancelError'

/** 原始 API 响应类型 - 外部 API 返回的未知格式数据 */
export type RawApiResponse = Record<string, unknown>

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  code: number | null
  raw?: unknown // 原始响应（调试用）
}

export interface ResponseParseOptions {
  // 成功的状态码列表
  successCodes?: number[]
  // 数据字段路径，如 'data.result' 或 'response.data'
  dataPath?: string
  // 错误字段路径
  errorPath?: string
  // 状态码字段路径
  codePath?: string
}

const DEFAULT_SUCCESS_CODES = [0, 200, 2000, 20000]

/**
 * 从对象中按路径获取值
 * @param obj 对象
 * @param path 路径，如 'data.result.songs'
 * @returns 值或 undefined
 */
function getValueByPath(obj: unknown, path?: string): unknown {
  if (!path || !obj) return obj

  const keys = path.split('.')
  let value: unknown = obj

  for (const key of keys) {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }

  return value
}

/**
 * 解析 API 响应
 * @param response 原始响应
 * @param options 解析选项
 * @returns 统一格式的响应
 */
export function parseResponse<T>(
  response: unknown,
  options: ResponseParseOptions = {}
): ApiResponse<T> {
  const {
    successCodes = DEFAULT_SUCCESS_CODES,
    dataPath,
    errorPath = 'message,error,msg',
    codePath = 'code,result,status'
  } = options

  // 空响应检查
  if (!response) {
    return {
      success: false,
      data: null,
      error: 'Empty response',
      code: -1,
      raw: response
    }
  }

  // 提取状态码（支持多个字段）
  let code: number | null = null
  const codeFields = codePath.split(',')
  for (const field of codeFields) {
    const val = getValueByPath(response, field.trim())
    if (val !== undefined && val !== null) {
      code = Number(val)
      break
    }
  }

  // 判断成功状态
  const isSuccess = code !== null && successCodes.includes(code)

  // 提取数据
  let data: unknown = response
  if (dataPath) {
    data = getValueByPath(response, dataPath)
  } else if (typeof response === 'object' && response !== null) {
    // 自动检测常见的数据字段
    const resp = response as Record<string, unknown>
    data = resp.data ?? resp.result ?? resp.response ?? response
  }

  // 提取错误信息
  let error: string | null = null
  if (!isSuccess) {
    const errorFields = errorPath.split(',')
    for (const field of errorFields) {
      const val = getValueByPath(response, field.trim())
      if (val !== undefined && val !== null && val !== '') {
        error = String(val)
        break
      }
    }
  }

  return {
    success: isSuccess,
    data: data as T,
    error,
    code,
    raw: response
  }
}

/**
 * QQ 音乐响应解析
 */
export function parseQQMusicResponse<T>(response: unknown): ApiResponse<T> {
  // QQ 音乐可能返回包装在 response 字段中的 JSON 字符串
  let parsed: unknown = response

  if (typeof response === 'object' && response !== null) {
    const resp = response as Record<string, unknown>

    if (typeof resp.response === 'string') {
      try {
        parsed = JSON.parse(resp.response)
      } catch (e) {
        console.warn('Failed to parse QQ Music wrapped response:', e)
      }
    } else if (resp.response && typeof resp.response === 'object') {
      parsed = resp.response
    }
  }

  return parseResponse<T>(parsed, {
    successCodes: [0, 200, 20000], // 扩展成功状态码
    codePath: 'code,result,status', // 扩展状态码字段
    errorPath: 'message,error,msg'
  })
}

/**
 * 网易云音乐响应解析
 */
export function parseNeteaseResponse<T>(response: unknown): ApiResponse<T> {
  return parseResponse<T>(response, {
    successCodes: [200, 0],
    codePath: 'code,result',
    errorPath: 'message,error,msg'
  })
}

/**
 * 处理 API 错误
 * @param error 错误对象
 * @param context 上下文信息
 * @returns 格式化的错误信息
 */
export function handleApiError(error: unknown, context?: string): Error {
  if (isCanceledRequestError(error)) {
    return new Error(context ? `${context}: canceled` : 'canceled')
  }

  let message = '请求失败'

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>
    if (typeof err.message === 'string') {
      message = err.message
    } else if (typeof err.toString === 'function' && err.toString() !== '[object Object]') {
      message = err.toString()
    }
  } else if (typeof error === 'string') {
    message = error
  }

  // 网络错误分类
  if (message.includes('Network Error') || message.includes('ECONNREFUSED')) {
    message = '网络错误：API 服务未启动'
  } else if (message.includes('timeout') || message.includes('ECONNABORTED')) {
    message = '请求超时'
  } else if (message.includes('404')) {
    message = '接口不存在'
  }

  const fullMessage = context ? `${context}: ${message}` : message

  console.error('[API Error]', fullMessage, error)
  return new Error(fullMessage)
}

/** 搜索响应验证结果 - 从 schemas.ts 重新导出 */
export type { SearchValidationResult }

/**
 * 验证搜索响应数据
 * 使用 Zod Schema 进行运行时验证
 */
export function validateSearchResponse(data: unknown): SearchValidationResult {
  // QQ 音乐格式: { song: { list: [], totalnum: N } }
  const QQMusicSchema = z.object({
    song: z.object({
      list: z.array(z.unknown()),
      totalnum: z.number()
    })
  })

  const qqResult = QQMusicSchema.safeParse(data)
  if (qqResult.success) {
    return {
      valid: true,
      list: qqResult.data.song.list,
      total: qqResult.data.song.totalnum
    }
  }

  // 网易云格式: { songs: [], songCount: N }
  const NeteaseSchema = z.object({
    songs: z.array(z.unknown()),
    songCount: z.number()
  })

  const neteaseResult = NeteaseSchema.safeParse(data)
  if (neteaseResult.success) {
    return {
      valid: true,
      list: neteaseResult.data.songs,
      total: neteaseResult.data.songCount
    }
  }

  // 通用格式: { list: [], total: N }
  const GenericSchema = z.object({
    list: z.array(z.unknown()),
    total: z.number()
  })

  const genericResult = GenericSchema.safeParse(data)
  if (genericResult.success) {
    return {
      valid: true,
      list: genericResult.data.list,
      total: genericResult.data.total
    }
  }

  return {
    valid: false,
    list: [],
    total: 0,
    error: '未知的数据格式'
  }
}
