/**
 * LLM HTTP 代理处理器
 *
 * 渲染进程通过此 IPC 通道将 LLM API 请求转发到主进程，
 * 由主进程发起 HTTP 请求以绕过浏览器 CORS 限制。
 */

import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS } from '@shared/protocol/channels'
import type { LlmChatPayload, LlmChatResponse } from '@shared/contracts/ipc'

export function registerLlmHandlers(): void {
  ipcService.registerInvoke(
    INVOKE_CHANNELS.LLM_CHAT,
    async (payload: LlmChatPayload): Promise<LlmChatResponse> => {
      try {
        const response = await fetch(payload.url, {
          method: 'POST',
          headers: payload.headers,
          body: JSON.stringify(payload.body),
          signal: AbortSignal.timeout(30_000)
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          return { ok: false, error: `HTTP ${response.status}: ${text}` }
        }

        const data = await response.json()
        return { ok: true, data }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )
}
