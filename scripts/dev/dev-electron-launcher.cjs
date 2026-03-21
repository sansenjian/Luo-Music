const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')
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

async function main() {
  await waitForPort(5173)

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
  const viteDevServerUrl = 'http://localhost:5173'

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
