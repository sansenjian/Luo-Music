import request from '@/utils/http'
import { NeteaseAdapter } from './adapter'

export const neteaseAdapter = new NeteaseAdapter(request)

export * from './search'
export * from './song'
export * from './playlist'
