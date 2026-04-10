import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('node:http', () => ({
  default: {
    request: requestMock
  },
  request: requestMock
}))

describe('electron/requestClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects timeout failures through req.destroy(error)', async () => {
    const destroyMock = vi.fn<(error?: Error) => void>()

    requestMock.mockImplementation(() => {
      const req = new EventEmitter() as EventEmitter & {
        destroy: (error?: Error) => void
        end: () => void
        write: (chunk: string) => void
      }

      req.destroy = (error?: Error) => {
        destroyMock(error)
        if (error) {
          req.emit('error', error)
        }
      }
      req.write = () => {}
      req.end = () => {
        req.emit('timeout')
      }

      return req
    })

    const { requestJson } = await import('../../electron/service/requestClient')

    await expect(
      requestJson(3200, 'getSearchByKey', { key: 'jay' }, { method: 'GET', serviceName: 'QQ' })
    ).rejects.toMatchObject({
      code: 'LOCAL_SERVICE_TIMEOUT',
      message: 'QQ local service request timed out after 10000ms: /getSearchByKey?key=jay'
    })

    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(destroyMock.mock.calls[0]?.[0]).toMatchObject({
      code: 'LOCAL_SERVICE_TIMEOUT'
    })
  })
})
