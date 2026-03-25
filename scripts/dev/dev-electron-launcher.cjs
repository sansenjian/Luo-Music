const fs = require('fs')
const http = require('http')
const net = require('net')
const path = require('path')
const { spawn, execSync } = require('child_process')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function resolveElectronViteCli() {
  const packageJsonPath = require.resolve('electron-vite/package.json')
  const cliPath = path.join(path.dirname(packageJsonPath), 'bin', 'electron-vite.js')

  if (!fs.existsSync(cliPath)) {
    throw new Error(`electron-vite CLI not found at ${cliPath}`)
  }

  return cliPath
}

function waitForFreshFile(file, startTime) {
  return new Promise((resolve) => {
    const check = () => {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        if (stat.mtimeMs >= startTime) {
          resolve()
          return
        }
      }
      setTimeout(check, 300)
    }
    check()
  })
}

function getLatestMTime(targetPath, predicate = () => true) {
  if (!fs.existsSync(targetPath)) {
    return 0
  }

  const stat = fs.statSync(targetPath)
  if (stat.isFile()) {
    return predicate(targetPath) ? stat.mtimeMs : 0
  }

  if (!stat.isDirectory()) {
    return 0
  }

  let latest = 0
  const entries = fs.readdirSync(targetPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    const childLatest = getLatestMTime(fullPath, predicate)
    if (childLatest > latest) {
      latest = childLatest
    }
  }

  return latest
}

function waitForPort(port) {
  return new Promise((resolve) => {
    const check = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.on('connect', () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => {
        setTimeout(check, 300)
      })
    }
    check()
  })
}

function waitForHttpReady(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs

    const retry = (reason) => {
      if (Date.now() >= deadline) {
        reject(new Error(`Dev server HTTP warmup timeout after ${timeoutMs}ms (${reason})`))
        return
      }
      setTimeout(check, 500)
    }

    const check = () => {
      const req = http.get(url, (res) => {
        res.resume()

        const statusCode = res.statusCode ?? 0
        if (statusCode >= 200 && statusCode < 500) {
          resolve()
          return
        }

        retry(`status ${statusCode}`)
      })

      req.on('error', (error) => {
        retry(error.message)
      })

      req.setTimeout(5000, () => {
        req.destroy(new Error('request timeout'))
      })
    }

    check()
  })
}

function killOldElectronInstances() {
  return new Promise((resolve) => {
    console.log('[dev-electron-launcher] Checking for old Electron instances...')

    try {
      if (process.platform === 'win32') {
        // Windows: use taskkill to find and kill electron.exe processes
        execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' })
        console.log('[dev-electron-launcher] Killed old Electron instances')
      } else {
        // Unix-like: use pkill
        execSync('pkill -f electron', { stdio: 'ignore' })
        console.log('[dev-electron-launcher] Killed old Electron instances')
      }
    } catch (error) {
      // No processes found or permission error - not fatal
      console.log('[dev-electron-launcher] No old Electron instances found')
    }

    resolve()
  })
}

function buildElectron() {
  return new Promise((resolve, reject) => {
    console.log('[dev-electron-launcher] Building electron files with electron-vite...')
    const electronViteCli = resolveElectronViteCli()
    const child = spawn(
      process.execPath,
      [electronViteCli, 'build', '--config', 'electron.vite.config.ts'],
      {
        stdio: 'inherit',
        shell: false,
        cwd: process.cwd()
      }
    )
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Build failed with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function findVitePort() {
  const ports = [5173, 5174, 5175, 5176, 5177]

  for (const port of ports) {
    try {
      await waitForHttpReady(`http://127.0.0.1:${port}/`, 2000)
      console.log(`[dev-electron-launcher] Found Vite dev server on port ${port}`)
      return port
    } catch {
      // Try next port
    }
  }

  // Fallback to default
  return 5173
}

async function main() {
  // Kill any existing Electron instances first
  await killOldElectronInstances()

  await waitForPort(5173)
  console.log('[dev-electron-launcher] Warming Vite index response...')

  // Find the actual Vite port
  const vitePort = await findVitePort()
  const viteDevServerUrl = `http://127.0.0.1:${vitePort}`

  await waitForHttpReady(`${viteDevServerUrl}/`)

  const mainFile = 'build/electron/main.cjs'
  const preloadFile = 'build/electron/preload.cjs'

  const needsRebuild = () => {
    if (!fs.existsSync(mainFile) || !fs.existsSync(preloadFile)) {
      return true
    }

    try {
      const mainStat = fs.statSync(mainFile)
      const preloadStat = fs.statSync(preloadFile)
      const latestBuiltTime = Math.min(mainStat.mtimeMs, preloadStat.mtimeMs)

      const latestElectronSourceTime = getLatestMTime(
        path.resolve('electron'),
        filePath => filePath.endsWith('.ts') || filePath.endsWith('.js')
      )
      const latestConfigTime = getLatestMTime(path.resolve('electron.vite.config.ts'))

      const latestSourceTime = Math.max(latestElectronSourceTime, latestConfigTime)
      if (latestSourceTime > latestBuiltTime) {
        return true
      }
    } catch {
      return true
    }

    return false
  }

  const needBuild = needsRebuild()

  if (needBuild) {
    console.log('[dev-electron-launcher] Electron files not found, building...')
    await buildElectron()
  }

  const electronBinary = require('electron')
  const appPath = path.resolve('.')

  const child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    shell: false,
    cwd: appPath,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteDevServerUrl
    }
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
