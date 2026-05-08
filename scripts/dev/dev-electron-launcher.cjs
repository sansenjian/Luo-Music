const http = require('node:http')
const { existsSync, readdirSync, statSync } = require('node:fs')
const { connect } = require('node:net')
const path = require('node:path')
const { spawn, execFileSync, execSync } = require('node:child_process')
const dotenv = require('dotenv')

const ROOT = path.resolve(__dirname, '../..')

dotenv.config({ path: path.resolve(ROOT, '.config/.env') })

function resolveVitePort(value, fallback = 5173) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function createVitePortCandidates(basePort, count = 5) {
  return Array.from({ length: count }, (_, index) => basePort + index)
}

function resolveElectronInspectArg(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '9223'
  if (!trimmed) {
    return null
  }

  const parsedPort = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid ELECTRON_INSPECTOR port: ${value}`)
  }

  return `--inspect=${parsedPort}`
}

function resolveElectronInspectPort(value) {
  const arg = resolveElectronInspectArg(value)
  return arg ? arg.replace('--inspect=', '') : null
}

const configuredVitePort = resolveVitePort(process.env.VITE_DEV_SERVER_PORT)
const electronInspectArg = resolveElectronInspectArg(process.env.ELECTRON_INSPECTOR)
const electronInspectPort = resolveElectronInspectPort(process.env.ELECTRON_INSPECTOR)
const REQUIRED_RENDERER_RUNTIME = 'electron'
const WINDOWS_POWERSHELL =
  process.env.SystemRoot &&
  existsSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'))
    ? path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    : 'powershell.exe'

// ============ 配置常量 ============
const CONFIG = {
  vitePorts: createVitePortCandidates(configuredVitePort),
  pollIntervalMs: 300,
  socketTimeoutMs: 2000,
  portDetectionHttpTimeoutMs: 2000,
  indexWarmupHttpTimeoutMs: 90000,
  indexWarmupTimeoutMs: 90000,
  httpTimeoutMs: 15000,
  httpWarmupTimeoutMs: 90000,
  viteHeartbeatIntervalMs: 5000,
  viteHeartbeatRequestTimeoutMs: 10000,
  viteHeartbeatStartupGraceMs: 60000,
  viteHeartbeatFailureLimit: 5,
  viteStartupTimeoutMs: 90000,
  buildOutput: {
    main: 'build/electron/main.cjs',
    preload: 'build/electron/preload.cjs',
    externalPluginWorker: 'build/electron/externalPluginWorker.mjs'
  },
  electronSourcePatterns: ['.ts', '.js', '.mjs'],
  electronConfig: 'electron/vite.config.ts',
  appProcessNames: ['electron.exe', 'LUO Music.exe']
}

// ============ 日志工具 ============
const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
}

function log(tag, message, color = colors.reset) {
  console.log(`${color}[${tag}]${colors.reset} ${message}`)
}

function logInfo(message) {
  log('dev-launcher', message, colors.blue)
}

function logSuccess(message) {
  log('dev-launcher', message, colors.green)
}

function logWarn(message) {
  log('dev-launcher', message, colors.yellow)
}

function logError(message) {
  log('dev-launcher', message, colors.red)
}

function logDebug(message) {
  if (process.env.DEBUG === 'dev-launcher') {
    log('dev-launcher:debug', message, colors.gray)
  }
}

// ============ 启动耗时 ============
const launcherStartedAt = Date.now()
const phaseTimings = []

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

function logPhaseTiming(label, startedAt) {
  const elapsed = Date.now() - startedAt
  phaseTimings.push({ label, elapsed })
  log(
    'dev-launcher:timing',
    `${label}: ${formatDuration(elapsed)} (total ${formatDuration(Date.now() - launcherStartedAt)})`,
    colors.cyan
  )
  return elapsed
}

async function measurePhase(label, action) {
  const startedAt = Date.now()
  try {
    const result = await action()
    logPhaseTiming(label, startedAt)
    return result
  } catch (error) {
    logPhaseTiming(`${label} failed`, startedAt)
    throw error
  }
}

function measureSyncPhase(label, action) {
  const startedAt = Date.now()
  try {
    const result = action()
    logPhaseTiming(label, startedAt)
    return result
  } catch (error) {
    logPhaseTiming(`${label} failed`, startedAt)
    throw error
  }
}

function logStartupTimingSummary() {
  const total = Date.now() - launcherStartedAt
  const detail = phaseTimings
    .map(({ label, elapsed }) => `${label} ${formatDuration(elapsed)}`)
    .join('; ')
  log(
    'dev-launcher:timing',
    `ready to spawn Electron: ${formatDuration(total)}${detail ? ` (${detail})` : ''}`,
    colors.cyan
  )
}

// ============ 等待工具 ============
async function waitForCondition(
  condition,
  { interval = CONFIG.pollIntervalMs, timeout = 0, description = 'condition' } = {}
) {
  return new Promise((resolve, reject) => {
    const deadline = timeout > 0 ? Date.now() + timeout : Infinity

    const check = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timeout waiting for ${description}`))
        return
      }

      const result = condition()
      if (result instanceof Promise) {
        result
          .then(testResolve => {
            if (testResolve) {
              resolve()
            } else {
              setTimeout(check, interval)
            }
          })
          .catch(() => {
            setTimeout(check, interval)
          })
      } else if (result) {
        resolve()
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}

async function waitForPort(port, timeoutMs = CONFIG.viteStartupTimeoutMs) {
  logDebug(`Waiting for port ${port}...`)
  return waitForCondition(
    () => {
      return new Promise(testResolve => {
        const socket = connect(port, '127.0.0.1')
        socket.on('connect', () => {
          socket.end()
          testResolve(true)
        })
        socket.on('error', () => testResolve(false))
      })
    },
    { timeout: timeoutMs, description: `port ${port} to be available` }
  )
}

function getViteHtmlRuntime(body) {
  const match = body.match(
    /<meta\s+[^>]*name=["']luo-app-runtime["'][^>]*content=["']([^"']+)["'][^>]*>/i
  )

  if (match) {
    return match[1]
  }

  const reversedMatch = body.match(
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']luo-app-runtime["'][^>]*>/i
  )

  return reversedMatch?.[1] ?? null
}

function isLikelyViteHtmlResponse(body, { requiredRuntime } = {}) {
  const hasViteHtml =
    body.includes('/@vite/client') || body.includes('__vite') || body.includes('id="app"')
  if (!hasViteHtml) {
    return false
  }

  if (!requiredRuntime) {
    return true
  }

  return getViteHtmlRuntime(body) === requiredRuntime
}

function getRuntimeProbeValue(body) {
  try {
    const parsed = JSON.parse(body)
    return typeof parsed?.runtime === 'string' ? parsed.runtime : null
  } catch {
    return null
  }
}

function isExpectedRuntimeProbeResponse(body, requiredRuntime) {
  return getRuntimeProbeValue(body) === requiredRuntime
}

async function waitForHttpReady(
  url,
  timeoutMs = CONFIG.httpWarmupTimeoutMs,
  {
    requireRuntimeProbe = false,
    requireViteHtml = false,
    requiredRuntime = null,
    requestTimeoutMs = CONFIG.httpTimeoutMs
  } = {}
) {
  logDebug(`Waiting for HTTP ready: ${url}`)
  return waitForCondition(
    () => {
      return new Promise(testResolve => {
        const req = http.get(url, res => {
          const statusCode = res.statusCode ?? 0
          if (statusCode < 200 || statusCode >= 500) {
            res.resume()
            testResolve(false)
            return
          }

          if (!requireRuntimeProbe && !requireViteHtml) {
            res.resume()
            testResolve(true)
            return
          }

          let body = ''
          res.setEncoding('utf8')
          res.on('data', chunk => {
            if (body.length < 8192) {
              body += chunk
            }
          })
          res.on('end', () => {
            if (requireRuntimeProbe) {
              testResolve(isExpectedRuntimeProbeResponse(body, requiredRuntime))
              return
            }

            testResolve(isLikelyViteHtmlResponse(body, { requiredRuntime }))
          })
        })
        req.on('error', () => testResolve(false))
        req.setTimeout(requestTimeoutMs, () => {
          req.destroy()
          testResolve(false)
        })
      })
    },
    { timeout: timeoutMs, description: `HTTP server at ${url} to be ready` }
  )
}

function checkHttpReadyOnce(
  url,
  {
    requireRuntimeProbe = false,
    requireViteHtml = false,
    requiredRuntime = null,
    requestTimeoutMs = CONFIG.httpTimeoutMs
  } = {}
) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      const statusCode = res.statusCode ?? 0
      if (statusCode < 200 || statusCode >= 500) {
        res.resume()
        resolve(false)
        return
      }

      if (!requireRuntimeProbe && !requireViteHtml) {
        res.resume()
        resolve(true)
        return
      }

      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        if (body.length < 8192) {
          body += chunk
        }
      })
      res.on('end', () => {
        if (requireRuntimeProbe) {
          resolve(isExpectedRuntimeProbeResponse(body, requiredRuntime))
          return
        }

        resolve(isLikelyViteHtmlResponse(body, { requiredRuntime }))
      })
    })

    req.on('error', () => resolve(false))
    req.setTimeout(requestTimeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function isWithinViteHeartbeatStartupGrace(startedAt, now = Date.now()) {
  return now - startedAt < CONFIG.viteHeartbeatStartupGraceMs
}

// ============ 文件工具 ============
function getLatestMTime(targetPath, predicate = () => true) {
  if (!existsSync(targetPath)) {
    return 0
  }

  try {
    const stat = statSync(targetPath)
    if (stat.isFile()) {
      return predicate(targetPath) ? stat.mtimeMs : 0
    }

    if (!stat.isDirectory()) {
      return 0
    }

    let latest = 0
    const entries = readdirSync(targetPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name)
      const childLatest = getLatestMTime(fullPath, predicate)
      if (childLatest > latest) {
        latest = childLatest
      }
    }

    return latest
  } catch {
    return 0
  }
}

function needsRebuild() {
  const outputPaths = Object.values(CONFIG.buildOutput).map(outputPath =>
    path.resolve(ROOT, outputPath)
  )

  if (outputPaths.some(outputPath => !existsSync(outputPath))) {
    logDebug('Build output files not found')
    return true
  }

  try {
    const latestBuiltTime = Math.min(...outputPaths.map(outputPath => statSync(outputPath).mtimeMs))

    const latestElectronSourceTime = getLatestMTime(path.resolve(ROOT, 'electron'), filePath =>
      CONFIG.electronSourcePatterns.some(ext => filePath.endsWith(ext))
    )
    const latestConfigTime = getLatestMTime(path.resolve(ROOT, CONFIG.electronConfig))
    const latestSourceTime = Math.max(latestElectronSourceTime, latestConfigTime)

    const needs = latestSourceTime > latestBuiltTime
    logDebug(
      `Source time: ${latestSourceTime}, Built time: ${latestBuiltTime}, Needs rebuild: ${needs}`
    )
    return needs
  } catch (error) {
    logDebug(`Error checking rebuild necessity: ${error.message}`)
    return true
  }
}

// ============ 进程管理 ============
function killOldElectronInstances() {
  return new Promise(resolve => {
    logInfo('Checking for old Electron instances...')

    if (process.platform === 'win32') {
      const killedProcesses = []

      for (const processName of CONFIG.appProcessNames) {
        try {
          execSync(`taskkill /F /IM "${processName}"`, { stdio: 'ignore' })
          killedProcesses.push(processName)
        } catch {
          logDebug(`No running process matched ${processName}`)
        }
      }

      if (killedProcesses.length > 0) {
        logSuccess(`Killed old instances: ${killedProcesses.join(', ')}`)
      } else {
        logInfo('No old Electron instances found')
      }

      resolve()
      return
    }

    try {
      execSync('pkill -f electron', { stdio: 'ignore' })
      logSuccess('Killed old Electron instances')
    } catch {
      logInfo('No old Electron instances found')
    }

    resolve()
  })
}

function normalizeCommandText(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function commandLineBelongsToProject(commandLine, projectRoot = ROOT) {
  const normalizedCommandLine = normalizeCommandText(commandLine)
  const normalizedRoot = normalizeCommandText(projectRoot)

  return normalizedCommandLine.includes(normalizedRoot)
}

function isProjectWebDevProcess(processInfo, projectRoot = ROOT) {
  const commandLine = processInfo?.commandLine ?? ''
  if (!commandLineBelongsToProject(commandLine, projectRoot)) {
    return false
  }

  const normalizedCommandLine = normalizeCommandText(commandLine)
  const usesSharedViteConfig =
    normalizedCommandLine.includes('vite') &&
    normalizedCommandLine.includes('.config/vite.config.ts')
  const isWebViteProcess =
    usesSharedViteConfig &&
    (normalizedCommandLine.includes('app_runtime=web') ||
      normalizedCommandLine.includes('--mode web') ||
      normalizedCommandLine.includes('--mode=web'))
  const isWebConcurrentlyProcess =
    normalizedCommandLine.includes('concurrently') &&
    normalizedCommandLine.includes('npm run server') &&
    normalizedCommandLine.includes('app_runtime=web')
  const isWebServerProcess =
    normalizedCommandLine.includes('server/index.ts') &&
    (normalizedCommandLine.includes('tsx') || normalizedCommandLine.includes('node'))

  return isWebViteProcess || isWebConcurrentlyProcess || isWebServerProcess
}

function normalizeProcessInfo(processInfo) {
  return {
    pid: Number(processInfo.ProcessId ?? processInfo.pid),
    parentPid: Number(processInfo.ParentProcessId ?? processInfo.parentPid ?? 0),
    name: String(processInfo.Name ?? processInfo.name ?? ''),
    commandLine: String(processInfo.CommandLine ?? processInfo.commandLine ?? '')
  }
}

function parseWindowsProcessList(output) {
  const trimmed = output.trim()
  if (!trimmed) {
    return []
  }

  const parsed = JSON.parse(trimmed)
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map(normalizeProcessInfo)
    .filter(processInfo => Number.isInteger(processInfo.pid) && processInfo.pid > 0)
}

function listProcesses() {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        WINDOWS_POWERSHELL,
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'
        ],
        {
          encoding: 'utf8',
          windowsHide: true
        }
      )

      return parseWindowsProcessList(output)
    } catch (error) {
      logWarn(`Failed to enumerate Windows processes for dev:web cleanup: ${error.message}`)
      return []
    }
  }

  try {
    const output = execSync('ps -eo pid=,ppid=,comm=,args=', {
      encoding: 'utf8'
    })

    return output
      .split(/\r?\n/)
      .map(line => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
        if (!match) {
          return null
        }

        return {
          pid: Number(match[1]),
          parentPid: Number(match[2]),
          name: match[3],
          commandLine: match[4]
        }
      })
      .filter(Boolean)
  } catch (error) {
    logWarn(`Failed to enumerate processes for dev:web cleanup: ${error.message}`)
    return []
  }
}

function findProjectWebDevCleanupTargets(processes, projectRoot = ROOT) {
  return processes
    .map(normalizeProcessInfo)
    .filter(processInfo => processInfo.pid !== process.pid)
    .filter(processInfo => isProjectWebDevProcess(processInfo, projectRoot))
    .sort((left, right) => left.pid - right.pid)
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true
    })
    return
  }

  execSync(`pkill -TERM -P ${pid} || true`, { stdio: 'ignore' })
  execSync(`kill -TERM ${pid} || true`, { stdio: 'ignore' })
}

function terminateProcessTree(pid, killTree = killProcessTree) {
  try {
    killTree(pid)
    return true
  } catch (error) {
    logDebug(`Failed to terminate process tree ${pid}: ${error.message}`)
    return false
  }
}

function cleanupConflictingWebDevProcesses() {
  const targets = findProjectWebDevCleanupTargets(listProcesses())

  if (targets.length === 0) {
    logInfo('No conflicting dev:web processes found')
    return
  }

  logWarn(
    `Stopping conflicting dev:web processes from this repo: ${targets
      .map(processInfo => `${processInfo.name || 'process'}(${processInfo.pid})`)
      .join(', ')}`
  )

  const killed = []
  for (const target of targets) {
    try {
      killProcessTree(target.pid)
      killed.push(target.pid)
    } catch (error) {
      logDebug(`Failed to stop process ${target.pid}: ${error.message}`)
    }
  }

  if (killed.length > 0) {
    logSuccess(`Stopped conflicting dev:web process trees: ${killed.join(', ')}`)
  }
}

function resolveElectronViteCli() {
  try {
    const packageJsonPath = require.resolve('electron-vite/package.json')
    const cliPath = path.join(path.dirname(packageJsonPath), 'bin', 'electron-vite.js')

    if (!existsSync(cliPath)) {
      throw new Error(`electron-vite CLI not found at ${cliPath}`)
    }

    return cliPath
  } catch (error) {
    logError(`Failed to resolve electron-vite CLI: ${error.message}`)
    process.exit(1)
  }
}

function buildElectron() {
  return new Promise((resolve, reject) => {
    logInfo('Building electron files with electron-vite...')

    const electronViteCli = resolveElectronViteCli()
    const child = spawn(
      process.execPath,
      [electronViteCli, 'build', '--config', CONFIG.electronConfig],
      {
        stdio: 'inherit',
        shell: false,
        cwd: ROOT
      }
    )

    child.on('exit', code => {
      if (code === 0) {
        logSuccess('Electron build completed')
        resolve()
      } else {
        reject(new Error(`Build failed with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

// ============ 端口检测 ============
async function findVitePort() {
  for (const port of CONFIG.vitePorts) {
    try {
      await waitForHttpReady(`http://127.0.0.1:${port}/__luo-runtime`, CONFIG.socketTimeoutMs, {
        requireRuntimeProbe: true,
        requiredRuntime: REQUIRED_RENDERER_RUNTIME,
        requestTimeoutMs: CONFIG.portDetectionHttpTimeoutMs
      })
      logSuccess(`Found Vite dev server on port ${port}`)
      return port
    } catch {
      logDebug(`Port ${port} not available for ${REQUIRED_RENDERER_RUNTIME} renderer`)
    }
  }

  return null
}

async function waitForVitePort() {
  let detectedPort = null

  await waitForCondition(
    async () => {
      detectedPort = await findVitePort()
      return detectedPort !== null
    },
    {
      interval: CONFIG.pollIntervalMs,
      timeout: CONFIG.viteStartupTimeoutMs,
      description: `Vite dev server on ports ${CONFIG.vitePorts.join(', ')}`
    }
  )

  return detectedPort
}

// ============ 主函数 ============
async function main() {
  logInfo('Starting Electron development launcher...')

  // 1. 清理旧实例
  await measurePhase('kill old Electron instances', () => killOldElectronInstances())
  await measurePhase('cleanup conflicting dev:web processes', () =>
    cleanupConflictingWebDevProcesses()
  )

  // 2. 等待 Vite 服务器启动
  logInfo(`Waiting for Vite dev server on ports ${CONFIG.vitePorts.join(', ')}...`)
  try {
    await measurePhase(`wait for Vite socket ${CONFIG.vitePorts[0]}`, () =>
      waitForPort(CONFIG.vitePorts[0])
    )
    logSuccess(`Detected an open socket on base port ${CONFIG.vitePorts[0]}`)
  } catch (error) {
    logError(`Vite dev server not responding: ${error.message}`)
    process.exit(1)
  }

  // 3. 查找实际端口并预热
  let vitePort
  try {
    vitePort = await measurePhase('detect Vite HTML port', () => waitForVitePort())
  } catch (error) {
    logError(`Failed to detect a ready Vite server: ${error.message}`)
    process.exit(1)
  }

  const viteDevServerUrl = `http://127.0.0.1:${vitePort}`

  logInfo(`Warming Vite index response on port ${vitePort}...`)
  try {
    await measurePhase('warm Vite index response', () =>
      waitForHttpReady(`${viteDevServerUrl}/`, CONFIG.indexWarmupTimeoutMs, {
        requireViteHtml: true,
        requiredRuntime: REQUIRED_RENDERER_RUNTIME,
        requestTimeoutMs: CONFIG.indexWarmupHttpTimeoutMs
      })
    )
    logSuccess('Vite server ready')
  } catch (error) {
    logError(`Vite index response did not become ready: ${error.message}`)
    process.exit(1)
  }

  // 4. 检查是否需要构建
  const electronBuildNeeded = measureSyncPhase('check Electron build freshness', needsRebuild)
  if (electronBuildNeeded) {
    logInfo('Electron files need rebuild...')
    try {
      await measurePhase('electron-vite build', () => buildElectron())
    } catch (error) {
      logError(`Build failed: ${error.message}`)
      process.exit(1)
    }
  } else {
    logSuccess('Electron files are up to date')
  }

  // 5. 启动 Electron
  logInfo(`Launching Electron app...`)
  logDebug(`Vite URL: ${viteDevServerUrl}`)

  const electronBinary = require('electron')
  const electronArgs = []
  if (electronInspectArg) {
    electronArgs.push(electronInspectArg)
  }
  electronArgs.push('.')

  if (electronInspectPort) {
    logInfo(`Electron main process inspector listening on 127.0.0.1:${electronInspectPort}`)
  }

  logStartupTimingSummary()

  const child = spawn(electronBinary, electronArgs, {
    stdio: 'inherit',
    shell: false,
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteDevServerUrl
    }
  })

  let stoppingElectron = false
  let heartbeatFailures = 0
  let hasSeenSuccessfulHeartbeat = false
  let viteHeartbeatStopped = false
  let viteHeartbeatTimer = null
  const electronStartedAt = Date.now()
  const stopElectron = (reason = 'launcher shutdown') => {
    if (stoppingElectron) {
      return
    }

    stoppingElectron = true
    logInfo(`Stopping Electron app (${reason})...`)
    if (child.pid) {
      terminateProcessTree(child.pid)
      return
    }

    if (!child.killed) {
      child.kill()
    }
  }

  const clearViteHeartbeat = () => {
    viteHeartbeatStopped = true
    if (viteHeartbeatTimer) {
      clearTimeout(viteHeartbeatTimer)
      viteHeartbeatTimer = null
    }
  }
  const scheduleViteHeartbeat = () => {
    if (viteHeartbeatStopped || stoppingElectron) {
      return
    }

    viteHeartbeatTimer = setTimeout(() => {
      void checkHttpReadyOnce(`${viteDevServerUrl}/__luo-runtime`, {
        requireRuntimeProbe: true,
        requiredRuntime: REQUIRED_RENDERER_RUNTIME,
        requestTimeoutMs: CONFIG.viteHeartbeatRequestTimeoutMs
      }).then(isReady => {
        if (viteHeartbeatStopped || stoppingElectron) {
          return
        }

        if (isReady) {
          hasSeenSuccessfulHeartbeat = true
          heartbeatFailures = 0
          scheduleViteHeartbeat()
          return
        }

        if (!hasSeenSuccessfulHeartbeat && isWithinViteHeartbeatStartupGrace(electronStartedAt)) {
          logDebug(
            `Vite dev server heartbeat delayed during renderer startup (${formatDuration(
              Date.now() - electronStartedAt
            )}/${formatDuration(CONFIG.viteHeartbeatStartupGraceMs)})`
          )
          scheduleViteHeartbeat()
          return
        }

        heartbeatFailures += 1
        logWarn(
          `Vite dev server heartbeat failed (${heartbeatFailures}/${CONFIG.viteHeartbeatFailureLimit})`
        )
        if (heartbeatFailures >= CONFIG.viteHeartbeatFailureLimit) {
          stopElectron('Vite dev server stopped responding')
          return
        }

        scheduleViteHeartbeat()
      })
    }, CONFIG.viteHeartbeatIntervalMs)
  }
  scheduleViteHeartbeat()

  // 6. 处理进程事件
  child.on('error', error => {
    clearViteHeartbeat()
    logError(`Failed to start Electron: ${error.message}`)
    process.exit(1)
  })

  child.on('exit', code => {
    clearViteHeartbeat()
    stoppingElectron = true
    logInfo(`Electron exited with code ${code}`)
    process.exit(code ?? 0)
  })

  // 7. 优雅退出处理
  const cleanup = () => {
    clearViteHeartbeat()
    stopElectron('launcher shutdown')
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)
}

// 启动
if (require.main === module) {
  main().catch(error => {
    logError(error.message)
    console.error(error.stack)
    process.exit(1)
  })
}

module.exports = {
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
  terminateProcessTree
}
