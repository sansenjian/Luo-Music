import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const requestJsonMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  default: {
    spawn: spawnMock
  },
  spawn: spawnMock
}))

vi.mock('../../electron/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('../../electron/utils/paths', () => ({
  getScriptPath: vi.fn((scriptName: string) => `C:/mock/${scriptName}`)
}))

vi.mock('../../electron/service/requestClient', () => ({
  requestJson: requestJsonMock
}))

interface BaseServicePrototypeWithWaitForReady {
  waitForReady: () => Promise<void>
}

describe('electron/musicServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('kills spawned processes when startup readiness fails', async () => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: ReturnType<typeof vi.fn>
      exitCode: number | null
      signalCode: NodeJS.Signals | null
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.exitCode = null
    proc.signalCode = null
    proc.kill = vi.fn((signal?: NodeJS.Signals) => {
      proc.exitCode = signal === 'SIGKILL' ? 1 : 0
      proc.emit('exit', proc.exitCode)
      return true
    })

    spawnMock.mockReturnValue(proc)

    const { BaseService } = await import('../../electron/service/baseService')
    const waitForReadySpy = vi
      .spyOn(
        BaseService.prototype as unknown as BaseServicePrototypeWithWaitForReady,
        'waitForReady'
      )
      .mockRejectedValue(new Error('startup failed'))

    const { QQService } = await import('../../electron/service/musicServices')
    const service = new QQService(3200)

    await expect(service.start()).rejects.toThrow('startup failed')

    expect(waitForReadySpy).toHaveBeenCalled()
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    expect((service as unknown as { process: unknown }).process).toBeNull()
  })
})
