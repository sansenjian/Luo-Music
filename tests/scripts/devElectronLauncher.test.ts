import { createRequire } from 'node:module'
import http from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  CONFIG,
  checkHttpReadyOnce,
  findProjectWebDevCleanupTargets,
  getRuntimeProbeValue,
  getViteHtmlRuntime,
  isWithinViteHeartbeatStartupGrace,
  isExpectedRuntimeProbeResponse,
  isLikelyViteHtmlResponse,
  isProjectWebDevProcess,
  parseWindowsProcessList,
  resolveElectronInspectArg,
  resolveElectronInspectPort,
  terminateProcessTree
} = require('../../scripts/dev/dev-electron-launcher.cjs') as {
  CONFIG: {
    indexWarmupHttpTimeoutMs: number
    indexWarmupTimeoutMs: number
    viteHeartbeatFailureLimit: number
    viteHeartbeatIntervalMs: number
    viteHeartbeatRequestTimeoutMs: number
    viteHeartbeatStartupGraceMs: number
  }
  checkHttpReadyOnce: (
    url: string,
    options?: {
      requireRuntimeProbe?: boolean
      requiredRuntime?: string
      requestTimeoutMs?: number
    }
  ) => Promise<boolean>
  findProjectWebDevCleanupTargets: (
    processes: Array<{
      pid?: number
      parentPid?: number
      name?: string
      commandLine?: string
      ProcessId?: number
      ParentProcessId?: number
      Name?: string
      CommandLine?: string
    }>,
    projectRoot?: string
  ) => Array<{ pid: number; parentPid: number; name: string; commandLine: string }>
  getRuntimeProbeValue: (body: string) => string | null
  getViteHtmlRuntime: (body: string) => string | null
  isWithinViteHeartbeatStartupGrace: (startedAt: number, now?: number) => boolean
  isExpectedRuntimeProbeResponse: (body: string, requiredRuntime: string) => boolean
  isLikelyViteHtmlResponse: (
    body: string,
    options?: {
      requiredRuntime?: string
    }
  ) => boolean
  isProjectWebDevProcess: (processInfo: { commandLine?: string }, projectRoot?: string) => boolean
  parseWindowsProcessList: (
    output: string
  ) => Array<{ pid: number; parentPid: number; name: string; commandLine: string }>
  resolveElectronInspectArg: (value: string | undefined) => string | null
  resolveElectronInspectPort: (value: string | undefined) => string | null
  terminateProcessTree: (pid: number, killTree?: (pid: number) => void) => boolean
}

function createViteHtml(runtime: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    `  <meta name="luo-app-runtime" content="${runtime}">`,
    '  <script type="module" src="/@vite/client"></script>',
    '</head>',
    '<body><div id="app"></div></body>',
    '</html>'
  ].join('\n')
}

const testServers: http.Server[] = []

function createHttpServer(
  handler: http.RequestListener
): Promise<{ server: http.Server; url: string }> {
  return new Promise(resolve => {
    const server = http.createServer(handler)
    testServers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind test server')
      }

      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

afterEach(async () => {
  await Promise.all(
    testServers.splice(0).map(
      server =>
        new Promise<void>(resolve => {
          server.close(() => resolve())
        })
    )
  )
})

describe('dev Electron launcher Vite detection', () => {
  it('uses the default Electron inspector port unless explicitly disabled', () => {
    expect(resolveElectronInspectArg(undefined)).toBe('--inspect=9223')
    expect(resolveElectronInspectArg('')).toBeNull()
    expect(resolveElectronInspectArg(' 9223 ')).toBe('--inspect=9223')
    expect(resolveElectronInspectPort(undefined)).toBe('9223')
    expect(resolveElectronInspectPort('9223')).toBe('9223')
    expect(() => resolveElectronInspectArg('invalid')).toThrow('Invalid ELECTRON_INSPECTOR port')
  })

  it('waits long enough for Vite to finish cold renderer compilation before launching Electron', () => {
    expect(CONFIG.indexWarmupHttpTimeoutMs).toBeGreaterThanOrEqual(90000)
    expect(CONFIG.indexWarmupTimeoutMs).toBeGreaterThanOrEqual(90000)
    expect(CONFIG.viteHeartbeatIntervalMs).toBeGreaterThan(0)
    expect(CONFIG.viteHeartbeatIntervalMs).toBeGreaterThanOrEqual(5000)
    expect(CONFIG.viteHeartbeatRequestTimeoutMs).toBeGreaterThanOrEqual(10000)
    expect(CONFIG.viteHeartbeatStartupGraceMs).toBeGreaterThanOrEqual(60000)
    expect(CONFIG.viteHeartbeatFailureLimit).toBeGreaterThanOrEqual(5)
  })

  it('keeps the Vite heartbeat tolerant during Electron cold renderer startup', () => {
    expect(isWithinViteHeartbeatStartupGrace(10_000, 69_999)).toBe(true)
    expect(isWithinViteHeartbeatStartupGrace(10_000, 70_000)).toBe(false)
  })

  it('reads the renderer runtime from the lightweight Vite probe response', () => {
    expect(getRuntimeProbeValue('{"runtime":"electron"}')).toBe('electron')
    expect(getRuntimeProbeValue('{"runtime":"web"}')).toBe('web')
    expect(getRuntimeProbeValue('not-json')).toBeNull()
  })

  it('accepts only the expected lightweight runtime probe response', () => {
    expect(isExpectedRuntimeProbeResponse('{"runtime":"electron"}', 'electron')).toBe(true)
    expect(isExpectedRuntimeProbeResponse('{"runtime":"web"}', 'electron')).toBe(false)
  })

  it('reads the renderer runtime marker from Vite HTML', () => {
    expect(getViteHtmlRuntime(createViteHtml('electron'))).toBe('electron')
    expect(getViteHtmlRuntime(createViteHtml('web'))).toBe('web')
  })

  it('accepts only Electron renderer HTML when a runtime is required', () => {
    expect(
      isLikelyViteHtmlResponse(createViteHtml('electron'), { requiredRuntime: 'electron' })
    ).toBe(true)
    expect(isLikelyViteHtmlResponse(createViteHtml('web'), { requiredRuntime: 'electron' })).toBe(
      false
    )
  })

  it('does not treat non-Vite HTML as a ready renderer page', () => {
    expect(
      isLikelyViteHtmlResponse('<html><body><div id="other"></div></body></html>', {
        requiredRuntime: 'electron'
      })
    ).toBe(false)
  })

  it('checks a runtime probe response without polling', async () => {
    const { url } = await createHttpServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ runtime: 'electron' }))
    })

    await expect(
      checkHttpReadyOnce(`${url}/__luo-runtime`, {
        requireRuntimeProbe: true,
        requiredRuntime: 'electron',
        requestTimeoutMs: 1000
      })
    ).resolves.toBe(true)

    await expect(
      checkHttpReadyOnce(`${url}/__luo-runtime`, {
        requireRuntimeProbe: true,
        requiredRuntime: 'web',
        requestTimeoutMs: 1000
      })
    ).resolves.toBe(false)
  })
})

describe('dev Electron launcher dev:web cleanup detection', () => {
  const projectRoot = 'D:/Desktop/python/MusicWeb/luo_music_new'

  it('matches only same-repo web runtime processes that can conflict with Electron dev', () => {
    expect(
      isProjectWebDevProcess(
        {
          commandLine:
            '"node" "D:/Desktop/python/MusicWeb/luo_music_new/node_modules/vite/bin/vite.js" --config .config/vite.config.ts --mode web'
        },
        projectRoot
      )
    ).toBe(true)

    expect(
      isProjectWebDevProcess(
        {
          commandLine:
            '"node" --require D:/Desktop/python/MusicWeb/luo_music_new/node_modules/tsx/dist/preflight.cjs --import file:///D:/Desktop/python/MusicWeb/luo_music_new/node_modules/tsx/dist/loader.mjs server/index.ts'
        },
        projectRoot
      )
    ).toBe(true)

    expect(
      isProjectWebDevProcess(
        {
          commandLine:
            '"node" "D:/Desktop/python/MusicWeb/luo_music_new/node_modules/concurrently/dist/bin/concurrently.js" "npm run server" "node scripts/run-with-env.cjs APP_RUNTIME=web -- npm run vp -- --config .config/vite.config.ts --mode web"'
        },
        projectRoot
      )
    ).toBe(true)
  })

  it('does not match Electron runtime Vite or other project processes', () => {
    expect(
      isProjectWebDevProcess(
        {
          commandLine:
            '"node" "D:/Desktop/python/MusicWeb/luo_music_new/node_modules/vite/bin/vite.js" --config .config/vite.config.ts'
        },
        projectRoot
      )
    ).toBe(false)

    expect(
      isProjectWebDevProcess(
        {
          commandLine:
            '"node" "D:/other-project/node_modules/vite/bin/vite.js" --config .config/vite.config.ts --mode web'
        },
        projectRoot
      )
    ).toBe(false)
  })

  it('parses Windows process JSON and returns cleanup targets in pid order', () => {
    const processes = parseWindowsProcessList(
      JSON.stringify([
        {
          ProcessId: 42,
          ParentProcessId: 1,
          Name: 'node.exe',
          CommandLine: `"node" "${projectRoot}/node_modules/vite/bin/vite.js" --config .config/vite.config.ts --mode web`
        },
        {
          ProcessId: 7,
          ParentProcessId: 1,
          Name: 'node.exe',
          CommandLine: `"node" "${projectRoot}/node_modules/vite/bin/vite.js" --config .config/vite.config.ts`
        },
        {
          ProcessId: 21,
          ParentProcessId: 1,
          Name: 'node.exe',
          CommandLine: `"node" --require ${projectRoot}/node_modules/tsx/dist/preflight.cjs --import file:///${projectRoot}/node_modules/tsx/dist/loader.mjs server/index.ts`
        }
      ])
    )

    expect(
      findProjectWebDevCleanupTargets(processes, projectRoot).map(process => process.pid)
    ).toEqual([21, 42])
  })

  it('terminates process trees through an injectable kill function', () => {
    const killed: number[] = []

    expect(
      terminateProcessTree(1234, pid => {
        killed.push(pid)
      })
    ).toBe(true)
    expect(killed).toEqual([1234])

    expect(
      terminateProcessTree(5678, () => {
        throw new Error('access denied')
      })
    ).toBe(false)
  })
})
