const http = require('node:http')
const { existsSync, readdirSync, statSync } = require('node:fs')
const { connect } = require('node:net')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')
const dotenv = require('dotenv')

const ROOT = path.resolve(__dirname, '../..')

dotenv.config({ path: path.resolve(ROOT, '.env') })

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

// ============ 配置常量 ============
const CONFIG = {
  vitePorts: createVitePortCandidates(configuredVitePort),
  pollIntervalMs: 300,
  socketTimeoutMs: 2000,
  httpTimeoutMs: 15000,
  httpWarmupTimeoutMs: 90000,
  viteStartupTimeoutMs: 90000,
  buildOutput: {
    main: 'build/electron/main.cjs',
    preload: 'build/electron/preload.cjs'
  },
  electronSourcePatterns: ['.ts', '.js'],
  electronConfig: 'electron.vite.config.ts',
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

// ============ 等待工具 ============
async function waitForCondition(condition, { interval = CONFIG.pollIntervalMs, timeout = 0, description = 'condition' } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = timeout > 0 ? Date.now() + timeout : Infinity

    const check = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timeout waiting for ${description}`))
        return
      }

      const result = condition()
      if (result instanceof Promise) {
        result.then(testResolve => {
          if (testResolve) {
            resolve()
          } else {
            setTimeout(check, interval)
          }
        }).catch(() => {
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
      return new Promise((testResolve) => {
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

function isLikelyViteHtmlResponse(body) {
  return body.includes('/@vite/client') || body.includes('__vite') || body.includes('id="app"')
}

async function waitForHttpReady(
  url,
  timeoutMs = CONFIG.httpWarmupTimeoutMs,
  { requireViteHtml = false } = {}
) {
  logDebug(`Waiting for HTTP ready: ${url}`)
  return waitForCondition(
    () => {
      return new Promise((testResolve) => {
        const req = http.get(url, (res) => {
          const statusCode = res.statusCode ?? 0
          if (statusCode < 200 || statusCode >= 500) {
            res.resume()
            testResolve(false)
            return
          }

          if (!requireViteHtml) {
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
            testResolve(isLikelyViteHtmlResponse(body))
          })
        })
        req.on('error', () => testResolve(false))
        req.setTimeout(CONFIG.httpTimeoutMs, () => {
          req.destroy()
          testResolve(false)
        })
      })
    },
    { timeout: timeoutMs, description: `HTTP server at ${url} to be ready` }
  )
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
  const { main, preload } = CONFIG.buildOutput
  const mainPath = path.resolve(ROOT, main)
  const preloadPath = path.resolve(ROOT, preload)

  if (!existsSync(mainPath) || !existsSync(preloadPath)) {
    logDebug('Build output files not found')
    return true
  }

  try {
    const mainStat = statSync(mainPath)
    const preloadStat = statSync(preloadPath)
    const latestBuiltTime = Math.min(mainStat.mtimeMs, preloadStat.mtimeMs)

    const latestElectronSourceTime = getLatestMTime(
      path.resolve(ROOT, 'electron'),
      filePath => CONFIG.electronSourcePatterns.some(ext => filePath.endsWith(ext))
    )
    const latestConfigTime = getLatestMTime(path.resolve(ROOT, CONFIG.electronConfig))
    const latestSourceTime = Math.max(latestElectronSourceTime, latestConfigTime)

    const needs = latestSourceTime > latestBuiltTime
    logDebug(`Source time: ${latestSourceTime}, Built time: ${latestBuiltTime}, Needs rebuild: ${needs}`)
    return needs
  } catch (error) {
    logDebug(`Error checking rebuild necessity: ${error.message}`)
    return true
  }
}

// ============ 进程管理 ============
function killOldElectronInstances() {
  return new Promise((resolve) => {
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

    child.on('exit', (code) => {
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
      await waitForHttpReady(`http://127.0.0.1:${port}/`, CONFIG.socketTimeoutMs, {
        requireViteHtml: true
      })
      logSuccess(`Found Vite dev server on port ${port}`)
      return port
    } catch {
      logDebug(`Port ${port} not available`)
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
  await killOldElectronInstances()

  // 2. 等待 Vite 服务器启动
  logInfo(`Waiting for Vite dev server on ports ${CONFIG.vitePorts.join(', ')}...`)
  try {
    await waitForPort(CONFIG.vitePorts[0])
    logSuccess(`Detected an open socket on base port ${CONFIG.vitePorts[0]}`)
  } catch (error) {
    logError(`Vite dev server not responding: ${error.message}`)
    process.exit(1)
  }

  // 3. 查找实际端口并预热
  let vitePort
  try {
    vitePort = await waitForVitePort()
  } catch (error) {
    logError(`Failed to detect a ready Vite server: ${error.message}`)
    process.exit(1)
  }

  const viteDevServerUrl = `http://127.0.0.1:${vitePort}`

  logInfo(`Warming Vite index response on port ${vitePort}...`)
  try {
    await waitForHttpReady(`${viteDevServerUrl}/`, CONFIG.httpWarmupTimeoutMs, {
      requireViteHtml: true
    })
    logSuccess('Vite server ready')
  } catch (error) {
    logError(`Failed to warm up Vite server: ${error.message}`)
    process.exit(1)
  }

  // 4. 检查是否需要构建
  if (needsRebuild()) {
    logInfo('Electron files need rebuild...')
    try {
      await buildElectron()
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

  // 6. 处理进程事件
  child.on('error', (error) => {
    logError(`Failed to start Electron: ${error.message}`)
    process.exit(1)
  })

  child.on('exit', (code) => {
    logInfo(`Electron exited with code ${code}`)
    process.exit(code ?? 0)
  })

  // 7. 优雅退出处理
  const cleanup = () => {
    logInfo('Shutting down...')
    if (!child.killed) {
      child.kill()
    }
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)
}

// 启动
main().catch((error) => {
  logError(error.message)
  console.error(error.stack)
  process.exit(1)
})
