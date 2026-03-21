import { z } from 'zod'

import type { SearchValidationResult } from '@/types/schemas'
import { normalizeApiError } from '@/utils/error/normalize'
import type { AppError } from '@/utils/error/types'
import { isCanceledRequestError } from '@/utils/http/cancelError'

export type RawApiResponse = Record<string, unknown>

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  code: number | null
  raw?: unknown
}

export interface ResponseParseOptions {
  successCodes?: number[]
  dataPath?: string
  errorPath?: string
  codePath?: string
}

const DEFAULT_SUCCESS_CODES = [0, 200, 2000, 20000]

function getValueByPath(obj: unknown, path?: string): unknown {
  if (!path || !obj) {
    return obj
  }

  const keys = path.split('.')
  let value: unknown = obj

  for (const key of keys) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return undefined
    }

    value = (value as Record<string, unknown>)[key]
  }

  return value
}

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

  if (!response) {
    return {
      success: false,
      data: null,
      error: 'Empty response',
      code: -1,
      raw: response
    }
  }

  let code: number | null = null
  for (const field of codePath.split(',')) {
    const value = getValueByPath(response, field.trim())
    if (value !== undefined && value !== null) {
      code = Number(value)
      break
    }
  }

  const success = code !== null && successCodes.includes(code)

  let data: unknown = response
  if (dataPath) {
    data = getValueByPath(response, dataPath)
  } else if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>
    data = record.data ?? record.result ?? record.response ?? response
  }

  let error: string | null = null
  if (!success) {
    for (const field of errorPath.split(',')) {
      const value = getValueByPath(response, field.trim())
      if (value !== undefined && value !== null && value !== '') {
        error = String(value)
        break
      }
    }
  }

  return {
    success,
    data: data as T,
    error,
    code,
    raw: response
  }
}

export function parseQQMusicResponse<T>(response: unknown): ApiResponse<T> {
  let parsed: unknown = response

  if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>

    if (typeof record.response === 'string') {
      try {
        parsed = JSON.parse(record.response)
      } catch (error) {
        console.warn('Failed to parse QQ Music wrapped response:', error)
      }
    } else if (record.response && typeof record.response === 'object') {
      parsed = record.response
    }
  }

  return parseResponse<T>(parsed, {
    successCodes: [0, 200, 20000],
    codePath: 'code,result,status',
    errorPath: 'message,error,msg'
  })
}

export function parseNeteaseResponse<T>(response: unknown): ApiResponse<T> {
  return parseResponse<T>(response, {
    successCodes: [200, 0],
    codePath: 'code,result',
    errorPath: 'message,error,msg'
  })
}

export function handleApiError(error: unknown, context?: string): AppError {
  const appError = normalizeApiError(error, context)

  if (!isCanceledRequestError(error)) {
    console.error('[API Error]', appError.message, error)
  }

  return appError
}

export type { SearchValidationResult }

export function validateSearchResponse(data: unknown): SearchValidationResult {
  const qqMusicSchema = z.object({
    song: z.object({
      list: z.array(z.unknown()),
      totalnum: z.number()
    })
  })

  const qqResult = qqMusicSchema.safeParse(data)
  if (qqResult.success) {
    return {
      valid: true,
      list: qqResult.data.song.list,
      total: qqResult.data.song.totalnum
    }
  }

  const neteaseSchema = z.object({
    songs: z.array(z.unknown()),
    songCount: z.number()
  })

  const neteaseResult = neteaseSchema.safeParse(data)
  if (neteaseResult.success) {
    return {
      valid: true,
      list: neteaseResult.data.songs,
      total: neteaseResult.data.songCount
    }
  }

  const genericSchema = z.object({
    list: z.array(z.unknown()),
    total: z.number()
  })

  const genericResult = genericSchema.safeParse(data)
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
    error: 'Unknown search response format'
  }
}
