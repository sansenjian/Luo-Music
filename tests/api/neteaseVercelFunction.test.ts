import { beforeEach, describe, expect, it, vi } from 'vitest'

type ModuleHandler = (
  query: Record<string, unknown>,
  request: (
    uri: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>
) => Promise<{ status?: number; body?: unknown; cookie?: string[] }>

const neteaseRuntimeState = vi.hoisted(() => {
  const endpointHandlers = new Map<string, ModuleHandler>()
  const generateConfigMock = vi.fn()
  const requestMock = vi.fn()
  const cookieToJsonMock = vi.fn(() => ({}))
  const getModulesDefinitionsMock = vi.fn(async () =>
    Array.from(endpointHandlers.entries()).map(([route, module]) => ({ route, module }))
  )

  const mockRequire = Object.assign(
    vi.fn((id: string) => {
      switch (id) {
        case '@neteasecloudmusicapienhanced/api/generateConfig.js':
          return generateConfigMock
        case '@neteasecloudmusicapienhanced/api/server.js':
          return { getModulesDefinitions: getModulesDefinitionsMock }
        case '@neteasecloudmusicapienhanced/api/util/request.js':
          return requestMock
        case '@neteasecloudmusicapienhanced/api/util/index.js':
          return { cookieToJson: cookieToJsonMock }
        case 'node:fs':
          return {
            existsSync: vi.fn(() => true),
            writeFileSync: vi.fn()
          }
        default:
          throw new Error(`Unexpected require: ${id}`)
      }
    }),
    {
      resolve: vi.fn((id: string) =>
        id === '@neteasecloudmusicapienhanced/api/server.js' ? '/virtual/netease/server.js' : id
      )
    }
  )

  return {
    endpointHandlers,
    generateConfigMock,
    requestMock,
    cookieToJsonMock,
    getModulesDefinitionsMock,
    mockRequire
  }
})

vi.mock('node:module', () => ({
  default: {
    createRequire: () => neteaseRuntimeState.mockRequire
  },
  createRequire: () => neteaseRuntimeState.mockRequire
}))

function createRequest() {
  return {
    method: 'GET',
    query: { path: ['test'] },
    headers: {},
    url: '/api/test'
  } as never
}

function createResponse() {
  const headers = new Map<string, unknown>()

  return {
    statusCode: 200,
    setHeader: vi.fn((key: string, value: unknown) => {
      headers.set(key, value)
    }),
    end: vi.fn(function (this: { body?: string }, body?: string) {
      this.body = body
    }),
    headers
  } as {
    statusCode: number
    setHeader: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    headers: Map<string, unknown>
    body?: string
  }
}

async function importHandler() {
  vi.resetModules()
  return (await import('../../api/[...netease].ts')).default
}

describe('netease Vercel function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    neteaseRuntimeState.endpointHandlers.clear()
    neteaseRuntimeState.generateConfigMock.mockResolvedValue(undefined)
    neteaseRuntimeState.requestMock.mockResolvedValue({})
    neteaseRuntimeState.cookieToJsonMock.mockReturnValue({})
    neteaseRuntimeState.getModulesDefinitionsMock.mockImplementation(async () =>
      Array.from(neteaseRuntimeState.endpointHandlers.entries()).map(([route, module]) => ({
        route,
        module
      }))
    )
  })

  it('retries runtime initialization after a failed bootstrap', async () => {
    neteaseRuntimeState.generateConfigMock
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockResolvedValueOnce(undefined)
    neteaseRuntimeState.endpointHandlers.set(
      '/test',
      vi.fn().mockResolvedValue({ body: { ok: true } })
    )

    const handler = await importHandler()

    await expect(handler(createRequest(), createResponse() as never)).rejects.toThrow(
      'bootstrap failed'
    )

    const response = createResponse()
    await expect(handler(createRequest(), response as never)).resolves.toBeUndefined()

    expect(neteaseRuntimeState.generateConfigMock).toHaveBeenCalledTimes(2)
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(JSON.stringify({ ok: true }))
  })

  it('maps ordinary thrown errors to a 500 response instead of a false 404', async () => {
    neteaseRuntimeState.endpointHandlers.set(
      '/test',
      vi.fn().mockRejectedValue(new Error('unexpected failure'))
    )

    const handler = await importHandler()
    const response = createResponse()

    await expect(handler(createRequest(), response as never)).resolves.toBeUndefined()

    expect(response.statusCode).toBe(500)
    expect(response.body).toBe(
      JSON.stringify({ code: 500, msg: 'Internal Server Error', data: null })
    )
  })
})
