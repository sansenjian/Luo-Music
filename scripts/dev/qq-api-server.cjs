// QQ 闊充箰 API 瀛愯繘绋嬫湇鍔?
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const { handleQQSearchRequest } = require('./qq-search-fallback.cjs')

const port = process.env.PORT || 3200
const host = process.env.HOST || '127.0.0.1'

console.log(`[QQ Music API] ========================================`)
console.log(`[QQ Music API] Starting...`)
console.log(`[QQ Music API] Port: ${port}`)
console.log(`[QQ Music API] Host: ${host}`)
console.log(`[QQ Music API] CWD: ${process.cwd()}`)
console.log(`[QQ Music API] NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`[QQ Music API] ========================================`)

async function start() {
  try {
    // 璁剧疆宸ヤ綔鐩綍鍒扮敤鎴锋暟鎹洰褰曪紝閬垮厤鍐欏叆鏉冮檺闂
    const userDataPath = process.env.USER_DATA || path.join(os.homedir(), '.luo-music')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    process.chdir(userDataPath)
    console.log(`[QQ Music API] Working directory changed to: ${userDataPath}`)
    
    // 璁剧疆鐜鍙橀噺
    process.env.PORT = String(port)
    process.env.HOST = host
    
    console.log('[QQ Music API] Loading module...')
    // 鍔犺浇 QQ 闊充箰 API
    const qqApiModule = require('@sansenjian/qq-music-api/dist/app.js')
    const qqApiApp = qqApiModule && (qqApiModule.default || qqApiModule)
    if (
      !qqApiApp ||
      typeof qqApiApp.listen !== 'function' ||
      typeof qqApiApp.callback !== 'function'
    ) {
      throw new Error('Invalid QQ Music API app export')
    }
    const appCallback = qqApiApp.callback()
    http
      .createServer(async (req, res) => {
        const handled = await handleQQSearchRequest(req, res)
        if (!handled) {
          appCallback(req, res)
        }
      })
      .listen(Number(port), host, () => {
        console.log(`[QQ Music API] Koa app listening on http://${host}:${port}`)
      })
    console.log('[QQ Music API] Module loaded successfully')
    
    console.log(`[QQ Music API] Server started, waiting for ready...`)
    
    // 绛夊緟纭鏈嶅姟鐪熺殑鍚姩浜?
    await waitForServer(port, host, 10000)
    
    
    // 閫氱煡鐖惰繘绋嬪凡灏辩华
    if (process.send) {
      process.send({ type: 'ready', port })
      console.log('[QQ Music API] Sent ready message to parent')
    }
  } catch (err) {
    console.error('[QQ Music API] 鉂?Failed to start:', err.message)
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
      console.log(`[QQ Music API] Health check attempt ${attempts}...`)

      const req = http.request({
        host,
        port,
        path: '/',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        if (resolved) return
        resolved = true
        // 鍙鏈嶅姟鍣ㄨ兘鍝嶅簲锛堝嵆浣?404锛夛紝璇存槑鏈嶅姟鍣ㄥ凡鍚姩
        // QQ Music API 鏍硅矾寰勮繑鍥?404 鏄甯哥殑
        console.log(`[QQ Music API] Server responded with status: ${res.statusCode}`)
        resolve()
      })

      req.on('error', (err) => {
        if (resolved) return
        console.log(`[QQ Music API] Health check failed: ${err.message}`)
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server did not start in ${timeout}ms`))
        } else {
          setTimeout(check, 500)
        }
      })

      req.on('timeout', () => {
        if (resolved) return
        console.log('[QQ Music API] Health check timeout')
        req.destroy()
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server did not start in ${timeout}ms`))
        } else {
          setTimeout(check, 500)
        }
      })

      req.end()
    }

    setTimeout(check, 1000)
  })
}

start()
