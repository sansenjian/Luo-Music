// 网易云 API 子进程服务
const http = require('http')
const path = require('path')

const port = process.env.PORT || 14532
const host = process.env.HOST || 'localhost'

console.log(`[Netease API] ========================================`)
console.log(`[Netease API] Starting...`)
console.log(`[Netease API] Port: ${port}`)
console.log(`[Netease API] Host: ${host}`)
console.log(`[Netease API] CWD: ${process.cwd()}`)
console.log(`[Netease API] NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`[Netease API] ========================================`)

function loadModule(moduleId) {
  const candidates = [moduleId]

  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'node_modules', moduleId))
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', moduleId))
  }

  let lastError = null

  for (const candidate of candidates) {
    try {
      console.log(`[Netease API] Resolving module from: ${candidate}`)
      return require(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error(`Cannot resolve module: ${moduleId}`)
}

async function start() {
  try {
    // 动态加载模块
    console.log('[Netease API] Loading module...')
    const { serveNcmApi } = loadModule('@neteasecloudmusicapienhanced/api')
    console.log('[Netease API] Module loaded successfully')
    
    console.log(`[Netease API] Starting server on ${host}:${port}...`)
    await serveNcmApi({
      port: parseInt(port),
      host: host,
    })
    
    console.log(`[Netease API] Server started, waiting for ready...`)
    
    // 等待确认服务真的启动了
    await waitForServer(port, host, 10000)
    
    // 通知父进程已就绪
    if (process.send) {
      process.send({ type: 'ready', port })
      console.log('[Netease API] Sent ready message to parent')
    }
  } catch (err) {
    console.error('[Netease API] ❌ Failed to start:', err.message)
    console.error(err.stack)
    
    if (process.send) {
      process.send({ type: 'error', error: err.message })
    }
    
    process.exit(1)
  }
}

function waitForServer(port, host, timeout) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let attempts = 0
    let resolved = false

    const check = () => {
      if (resolved) return
      attempts++
      console.log(`[Netease API] Health check attempt ${attempts}...`)

      const req = http.request({
        host,
        port,
        path: '/',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        if (resolved) return
        resolved = true
        // 只要服务器能响应（即使 404），说明服务器已启动
        console.log(`[Netease API] Server responded with status: ${res.statusCode}`)
        console.log(`[Netease API] ✅ Server confirmed running on http://${host}:${port}`)
        resolve()
      })

      req.on('error', (err) => {
        if (resolved) return
        console.log(`[Netease API] Health check failed: ${err.message}`)
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server did not start in ${timeout}ms`))
        } else {
          setTimeout(check, 500)
        }
      })

      req.on('timeout', () => {
        if (resolved) return
        console.log('[Netease API] Health check timeout')
        req.destroy()
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server did not start in ${timeout}ms`))
        } else {
          setTimeout(check, 500)
        }
      })

      req.end()
    }

    // 延迟开始检测，给服务器启动时间
    setTimeout(check, 1000)
  })
}

start()
