import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import http from 'node:http'

import { BaseService } from '../../electron/service/baseService'
import type { ServiceStatus } from '../../electron/types/service'

// Create a concrete implementation for testing
class TestService extends BaseService {
  startMock = vi.fn<() => Promise<void>>()
  stopMock = vi.fn<() => Promise<void>>()
  handleRequestMock =
    vi.fn<(endpoint: string, params: Record<string, unknown>) => Promise<unknown>>()

  constructor(serviceId: string, port: number) {
    super(serviceId, port)
  }

  override async start(): Promise<void> {
    return this.startMock()
  }

  override async stop(): Promise<void> {
    return this.stopMock()
  }

  override async handleRequest(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.handleRequestMock(endpoint, params)
  }

  // Expose protected methods for testing
  async testWaitForReady(timeout?: number): Promise<void> {
    return this.waitForReady(timeout)
  }

  setProcess(process: ChildProcess | null): void {
    this.process = process
  }

  setStatus(
    status: 'pending' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'unavailable'
  ): void {
    this.status = status
  }

  setLastError(error: string | undefined): void {
    this.lastError = error
  }
}

describe('BaseService', () => {
  let service: TestService

  beforeEach(() => {
    service = new TestService('test-service', 3000)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct serviceId and port', () => {
      expect(service['serviceId']).toBe('test-service')
      expect(service['port']).toBe(3000)
    })

    it('should initialize with pending status', () => {
      expect(service['status']).toBe('pending')
    })
  })

  describe('getStatus', () => {
    it('should return correct status for pending service', () => {
      const status = service.getStatus()
      expect(status.serviceId).toBe('test-service')
      expect(status.status).toBe('pending')
      expect(status.enabled).toBe(true)
      expect(status.port).toBe(3000)
    })

    it('should return enabled=false for stopped service', () => {
      service.setStatus('stopped')
      const status = service.getStatus()
      expect(status.enabled).toBe(false)
    })

    it('should return enabled=false for unavailable service', () => {
      service.setStatus('unavailable')
      const status = service.getStatus()
      expect(status.enabled).toBe(false)
    })

    it('should include lastError when set', () => {
      service.setLastError('Test error')
      const status = service.getStatus()
      expect(status.lastError).toBe('Test error')
    })
  })

  describe('isAlive', () => {
    it('should return false when status is not running', () => {
      expect(service.isAlive()).toBe(false)
    })

    it('should return false when status is running but process is null', () => {
      service.setStatus('running')
      service.setProcess(null)
      expect(service.isAlive()).toBe(false)
    })

    it('should return true when status is running and process exists', () => {
      service.setStatus('running')
      service.setProcess({} as ChildProcess)
      expect(service.isAlive()).toBe(true)
    })
  })

  describe('markAsRunning', () => {
    it('should update port and status', () => {
      service.markAsRunning(4000)

      expect(service['port']).toBe(4000)
      expect(service['status']).toBe('running')
    })

    it('should clear lastError', () => {
      service.setLastError('Previous error')
      service.markAsRunning(3000)

      expect(service['lastError']).toBeUndefined()
    })

    it('should update lastUpdate timestamp', () => {
      const before = Date.now()
      service.markAsRunning(3000)
      const after = Date.now()

      expect(service['lastUpdate']).toBeGreaterThanOrEqual(before)
      expect(service['lastUpdate']).toBeLessThanOrEqual(after)
    })
  })

  describe('abstract methods', () => {
    it('should call start implementation', async () => {
      service.startMock.mockResolvedValue(undefined)
      await service.start()
      expect(service.startMock).toHaveBeenCalled()
    })

    it('should call stop implementation', async () => {
      service.stopMock.mockResolvedValue(undefined)
      await service.stop()
      expect(service.stopMock).toHaveBeenCalled()
    })

    it('should call handleRequest implementation', async () => {
      service.handleRequestMock.mockResolvedValue({ result: 'ok' })
      const result = await service.handleRequest('search', { keyword: 'test' })
      expect(result).toEqual({ result: 'ok' })
      expect(service.handleRequestMock).toHaveBeenCalledWith('search', { keyword: 'test' })
    })
  })
})
