const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

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

/**
 * 启动网易云 API 服务端
 * 使用 server/index.ts 文件启动，而不是内联脚本
 */
function startNeteaseApi() {
  return new Promise((resolve, reject) => {
    console.log('[dev-electron-launcher] Starting Netease Cloud Music API server via server/index.ts...')
    const child = spawn('node', ['--import', 'tsx', 'server/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      cwd: process.cwd()
    })

    let isResolved = false
    const timeout = setTimeout(() => {
      if (!isResolved) {
        reject(new Error('Timeout waiting for Netease API to start'))
      }
    }, 10000)

    child.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(output.trim())
      if (output.includes('API started at http://localhost:14532') && !isResolved) {
        isResolved = true
        clearTimeout(timeout)
        resolve(child)
      }
    })

    child.stderr.on('data', (data) => {
      console.error(data.toString().trim())
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== 0 && !isResolved) {
        clearTimeout(timeout)
        reject(new Error(`Netease API server exited with code ${code}`))
      }
    })
  })
}

/**
 * 启动 QQ 音乐 API 服务端
 * 使用 scripts/dev/qq-api-server.cjs 脚本启动
 */
function startQQMusicApi() {
  return new Promise((resolve, reject) => {
    console.log('[dev-electron-launcher] Starting QQ Music API server...')
    const child = spawn('node', ['scripts/dev/qq-api-server.cjs'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      cwd: process.cwd()
    })

    let isResolved = false
    const timeout = setTimeout(() => {
      if (!isResolved) {
        console.warn('[dev-electron-launcher] QQ Music API startup timeout, continuing anyway...')
        isResolved = true
        resolve(child)
      }
    }, 15000)

    child.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(output.trim())
      // QQ 音乐 API 启动成功后会输出确认信息
      if (output.includes('Server confirmed running') && !isResolved) {
        isResolved = true
        clearTimeout(timeout)
        resolve(child)
      }
    })

    child.stderr.on('data', (data) => {
      console.error(data.toString().trim())
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      console.error('[dev-electron-launcher] QQ Music API error:', err.message)
      // QQ 音乐 API 启动失败不阻止应用启动
      resolve(null)
    })

    child.on('exit', (code) => {
      if (code !== 0 && !isResolved) {
        console.warn(`[dev-electron-launcher] QQ Music API server exited with code ${code}`)
        clearTimeout(timeout)
        resolve(null)
      }
    })
  })
}

function buildElectron() {
  return new Promise((resolve, reject) => {
    console.log('[dev-electron-launcher] Building electron files with electron-vite...')
    const child = spawn('pnpm', ['exec', 'electron-vite', 'build'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    })
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

/**
 * 主函数
 * 启动流程：
 * 1. 等待 Vite 开发服务器启动 (端口 5173)
 * 2. 启动网易云 API 服务端 (端口 14532)
 * 3. 启动 QQ 音乐 API 服务端 (端口 3200)
 * 4. 构建并启动 Electron
 */
async function main() {
  await waitForPort(5173)

  // 启动网易云 API 服务端
  const neteaseApiProcess = await startNeteaseApi()
  
  // 启动 QQ 音乐 API 服务端
  const qqApiProcess = await startQQMusicApi()

  const mainFile = 'build/electron/main.cjs'
  const preloadFile = 'build/electron/preload.cjs'

  const needBuild = !fs.existsSync(mainFile) || !fs.existsSync(preloadFile)

  if (needBuild) {
    console.log('[dev-electron-launcher] Electron files not found, building...')
    await buildElectron()
  }

  const electronBinary = require('electron')
  const appPath = path.resolve('.')

  // Vite 开发服务器 URL，用于让 Electron 加载开发服务器而非本地文件
  const viteDevServerUrl = 'http://localhost:5173'

  const child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    shell: false,
    cwd: appPath,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteDevServerUrl,
      // 告知 Electron 主进程 API 服务已由 launcher 启动
      NETEASE_API_STARTED_BY_LAUNCHER: 'true',
      QQ_MUSIC_API_STARTED_BY_LAUNCHER: 'true'
    }
  })

  child.on('exit', (code) => {
    // Electron 退出时，清理 API 服务端进程
    if (neteaseApiProcess) {
      console.log('[dev-electron-launcher] Shutting down Netease API server...')
      neteaseApiProcess.kill()
    }
    if (qqApiProcess) {
      console.log('[dev-electron-launcher] Shutting down QQ Music API server...')
      qqApiProcess.kill()
    }
    process.exit(code ?? 0)
  })

  child.on('error', (error) => {
    console.error(error)
    if (neteaseApiProcess) {
      neteaseApiProcess.kill()
    }
    if (qqApiProcess) {
      qqApiProcess.kill()
    }
    process.exit(1)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
