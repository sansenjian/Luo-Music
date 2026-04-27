import { Worker } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import logger from '../logger'
import type { ExternalPluginRegistration, PluginMethodName } from './types'
import { PluginStateStore } from './PluginStateStore'

type WorkerRequestMessage = {
  type: 'call'
  requestId: string
  method: PluginMethodName
  payload: unknown
}

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

type WorkerRuntime = {
  worker: Worker
  readyPromise: Promise<void>
  pendingCalls: Map<string, PendingCall>
}

type FetchFailureDetails = {
  code?: unknown
  address?: unknown
  port?: unknown
}

type PluginHttpRequestOptions = {
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface ExternalPluginHostDeps {
  stateStore?: PluginStateStore
  fetchImpl?: typeof fetch
  defaultTimeoutMs?: number
}

export class ExternalPluginHost {
  private readonly stateStore: PluginStateStore
  private readonly fetchImpl: typeof fetch
  private readonly defaultTimeoutMs: number
  private readonly runtimes = new Map<string, WorkerRuntime>()
  private requestCounter = 0

  constructor(deps: ExternalPluginHostDeps = {}) {
    this.stateStore = deps.stateStore ?? new PluginStateStore()
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.defaultTimeoutMs = deps.defaultTimeoutMs ?? 15000
  }

  async call(
    registration: ExternalPluginRegistration,
    method: PluginMethodName,
    payload: unknown
  ): Promise<unknown> {
    const runtime = await this.ensureRuntime(registration)
    const requestId = `${registration.manifest.platformId}:${++this.requestCounter}`

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        runtime.pendingCalls.delete(requestId)
        reject(new Error(`Plugin call timed out: ${registration.manifest.platformId}.${method}`))
      }, this.defaultTimeoutMs)

      runtime.pendingCalls.set(requestId, { resolve, reject, timeout })
      runtime.worker.postMessage({
        type: 'call',
        requestId,
        method,
        payload
      } satisfies WorkerRequestMessage)
    })
  }

  async stop(platformId: string): Promise<void> {
    const runtime = this.runtimes.get(platformId)
    if (!runtime) {
      return
    }

    this.runtimes.delete(platformId)

    for (const pending of runtime.pendingCalls.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`Plugin runtime stopped: ${platformId}`))
    }
    runtime.pendingCalls.clear()

    runtime.worker.postMessage({ type: 'dispose' })
    await runtime.worker.terminate()
  }

  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.runtimes.keys(), platformId => this.stop(platformId)))
  }

  private async ensureRuntime(registration: ExternalPluginRegistration): Promise<WorkerRuntime> {
    const existingRuntime = this.runtimes.get(registration.manifest.platformId)
    if (existingRuntime) {
      await existingRuntime.readyPromise
      return existingRuntime
    }

    const worker = new Worker(
      new URL('./externalPluginWorker.mjs', import.meta.url) as unknown as string,
      {
        workerData: {
          entryUrl: pathToFileURL(registration.entryPath).href,
          pluginId: registration.manifest.id,
          platformId: registration.manifest.platformId,
          settings: registration.state.settings
        }
      }
    )

    const pendingCalls = new Map<string, PendingCall>()
    let resolveReady!: () => void
    let rejectReady!: (reason?: unknown) => void
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    const runtime: WorkerRuntime = {
      worker,
      readyPromise,
      pendingCalls
    }

    worker.on('message', async message => {
      if (!message || typeof message !== 'object') {
        return
      }

      if (message.type === 'ready') {
        resolveReady()
        return
      }

      if (message.type === 'init-error') {
        const error = new Error(message.payload?.message ?? 'Failed to initialize plugin runtime')
        rejectReady(error)
        void this.stop(registration.manifest.platformId)
        return
      }

      if (message.type === 'call-result' || message.type === 'call-error') {
        const pendingCall = pendingCalls.get(message.requestId)
        if (!pendingCall) {
          return
        }

        pendingCalls.delete(message.requestId)
        clearTimeout(pendingCall.timeout)

        if (message.type === 'call-result') {
          pendingCall.resolve(message.result)
        } else {
          pendingCall.reject(new Error(message.error?.message ?? 'Plugin call failed'))
        }
        return
      }

      if (message.type === 'log') {
        const level = message.payload?.level ?? 'info'
        const logFn =
          (logger as unknown as Record<string, (...args: unknown[]) => void>)[level] ?? logger.info
        logFn(
          `[PluginHost:${registration.manifest.platformId}] ${message.payload?.message ?? ''}`,
          message.payload?.meta
        )
        return
      }

      if (message.type === 'storage:get') {
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: this.stateStore.getStorageValue(registration.manifest.id, message.payload.key)
        })
        return
      }

      if (message.type === 'storage:set') {
        this.stateStore.setStorageValue(
          registration.manifest.id,
          message.payload.key,
          message.payload.value
        )
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'storage:remove') {
        this.stateStore.removeStorageValue(registration.manifest.id, message.payload.key)
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'storage:clear') {
        this.stateStore.clearStorage(registration.manifest.id)
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'secrets:get') {
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: this.stateStore.getSecretValue(registration.manifest.id, message.payload.key)
        })
        return
      }

      if (message.type === 'secrets:set') {
        this.stateStore.setSecretValue(
          registration.manifest.id,
          message.payload.key,
          message.payload.value
        )
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'secrets:remove') {
        this.stateStore.removeSecretValue(registration.manifest.id, message.payload.key)
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'secrets:clear') {
        this.stateStore.clearSecrets(registration.manifest.id)
        worker.postMessage({
          type: 'response',
          requestId: message.requestId,
          ok: true,
          result: null
        })
        return
      }

      if (message.type === 'http:get' || message.type === 'http:post') {
        try {
          const result = await this.handleHttpRequest(
            registration,
            message.type === 'http:get' ? 'GET' : 'POST',
            message.payload.url,
            message.payload.params ?? message.payload.body,
            message.payload.options
          )
          worker.postMessage({ type: 'response', requestId: message.requestId, ok: true, result })
        } catch (error) {
          worker.postMessage({
            type: 'response',
            requestId: message.requestId,
            ok: false,
            error: {
              message: error instanceof Error ? error.message : String(error)
            }
          })
        }
      }
    })

    worker.once('error', error => {
      rejectReady(error)
      void this.stop(registration.manifest.platformId)
    })

    worker.once('exit', code => {
      if (code !== 0) {
        const runtimeError = new Error(
          `Plugin runtime exited unexpectedly (${registration.manifest.platformId}): ${code}`
        )
        rejectReady(runtimeError)
      }

      const activeRuntime = this.runtimes.get(registration.manifest.platformId)
      if (activeRuntime?.worker === worker) {
        this.runtimes.delete(registration.manifest.platformId)
      }

      for (const pending of pendingCalls.values()) {
        clearTimeout(pending.timeout)
        pending.reject(
          new Error(`Plugin runtime exited unexpectedly: ${registration.manifest.platformId}`)
        )
      }
      pendingCalls.clear()
    })

    this.runtimes.set(registration.manifest.platformId, runtime)
    await readyPromise
    return runtime
  }

  private async handleHttpRequest(
    registration: ExternalPluginRegistration,
    method: 'GET' | 'POST',
    url: string,
    payload: unknown,
    options?: PluginHttpRequestOptions
  ): Promise<unknown> {
    const requestUrl = new URL(url)
    const allowedDomains = registration.manifest.permissions?.network?.domains ?? []

    if (!this.isAllowedDomain(requestUrl.hostname, allowedDomains)) {
      throw new Error(`Plugin network access denied for domain: ${requestUrl.hostname}`)
    }

    if (method === 'GET' && payload && typeof payload === 'object') {
      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        if (value === undefined || value === null) {
          continue
        }
        requestUrl.searchParams.set(key, String(value))
      }
    }

    const headers = this.createRequestHeaders(method, options)
    const abortController =
      options?.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? new AbortController()
        : undefined
    const timeout =
      abortController && options?.timeoutMs
        ? setTimeout(() => abortController.abort(), Math.max(1, Math.round(options.timeoutMs)))
        : undefined

    let response: Response
    try {
      response = await this.fetchImpl(requestUrl, {
        method,
        headers,
        body: method === 'POST' && payload !== undefined ? JSON.stringify(payload) : undefined,
        signal: abortController?.signal
      })
    } catch (error) {
      throw this.createHttpFetchError(method, requestUrl, error)
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }

    if (!response.ok) {
      throw new Error(`Plugin HTTP request failed with status ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      return response.json()
    }

    return response.text()
  }

  private createRequestHeaders(
    method: 'GET' | 'POST',
    options?: PluginHttpRequestOptions
  ): Record<string, string> | undefined {
    const headers: Record<string, string> = {}

    if (method === 'POST') {
      headers['content-type'] = 'application/json'
    }

    for (const [key, value] of Object.entries(options?.headers ?? {})) {
      if (typeof value === 'string') {
        headers[key] = value
      }
    }

    return Object.keys(headers).length > 0 ? headers : undefined
  }

  private isAllowedDomain(hostname: string, allowedDomains: string[]): boolean {
    const normalizedHostname = hostname.toLowerCase()
    return allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase()

      if (
        normalizedHostname === normalizedDomain ||
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      ) {
        return true
      }

      return (
        normalizedDomain === 'localhost' &&
        (normalizedHostname === '127.0.0.1' || normalizedHostname === '::1')
      )
    })
  }

  private createHttpFetchError(method: 'GET' | 'POST', requestUrl: URL, error: unknown): Error {
    const details = this.getFetchFailureDetails(error)
    const message = error instanceof Error ? error.message : String(error)
    const code = typeof details.code === 'string' ? details.code : undefined
    const address = typeof details.address === 'string' ? details.address : undefined
    const port =
      typeof details.port === 'number' || typeof details.port === 'string'
        ? String(details.port)
        : undefined
    const diagnostic = [
      message,
      code ? `(${[code, address, port].filter(Boolean).join(' ')})` : undefined
    ]
      .filter(Boolean)
      .join(' ')
    const wrapped = new Error(
      `Plugin HTTP ${method} ${requestUrl.origin}${requestUrl.pathname} failed: ${diagnostic}`
    )
    ;(wrapped as Error & { cause?: unknown }).cause = error
    return wrapped
  }

  private getFetchFailureDetails(error: unknown): FetchFailureDetails {
    if (!error || typeof error !== 'object') {
      return {}
    }

    const errorWithCause = error as FetchFailureDetails & { cause?: unknown }
    const cause = errorWithCause.cause
    if (cause && typeof cause === 'object') {
      const causeDetails = cause as FetchFailureDetails
      return {
        code: causeDetails.code ?? errorWithCause.code,
        address: causeDetails.address ?? errorWithCause.address,
        port: causeDetails.port ?? errorWithCause.port
      }
    }

    return {
      code: errorWithCause.code,
      address: errorWithCause.address,
      port: errorWithCause.port
    }
  }
}
