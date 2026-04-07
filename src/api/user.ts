import { services } from '@/services'
import type { ApiService } from '@/services/apiService'

type UserApiClient = Pick<ApiService, 'request'>

export type UserApiDeps = {
  getApiService?: () => UserApiClient
  getTimestamp?: () => number
}

const defaultUserApiDeps: Required<UserApiDeps> = {
  getApiService: () => services.api(),
  getTimestamp: () => Date.now()
}

let userApiDeps: Required<UserApiDeps> = defaultUserApiDeps

export function configureUserApiDeps(deps: UserApiDeps): void {
  userApiDeps = {
    ...userApiDeps,
    ...deps
  }
}

export function resetUserApiDeps(): void {
  userApiDeps = defaultUserApiDeps
}

function neteaseRequest(endpoint: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return userApiDeps.getApiService().request('netease', endpoint, params)
}

function withTimestamp(params: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...params,
    timestamp: userApiDeps.getTimestamp()
  }
}

export function getQRKey() {
  return neteaseRequest('/login/qr/key', withTimestamp())
}

export function getQRCode(key: string) {
  return neteaseRequest('/login/qr/create', withTimestamp({ key, qrimg: true }))
}

export function checkQRStatus(key: string) {
  return neteaseRequest('/login/qr/check', withTimestamp({ key }))
}

export function getUserAccount() {
  return neteaseRequest('/user/account', withTimestamp())
}

export function logout() {
  return neteaseRequest('/logout', withTimestamp())
}

export function getUserDetail(uid: number) {
  return neteaseRequest('/user/detail', withTimestamp({ uid }))
}

export function getUserSubcount() {
  return neteaseRequest('/user/subcount', withTimestamp())
}

export function getUserLevel() {
  return neteaseRequest('/user/level', withTimestamp())
}

export function getUserEvent(uid: number, limit: number = 10, lasttime: number = -1) {
  return neteaseRequest('/user/event', withTimestamp({ uid, limit, lasttime }))
}
