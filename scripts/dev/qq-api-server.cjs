// QQ 音乐 API 子进程服务
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

const port = process.env.PORT || 3200
const host = process.env.HOST || 'localhost'

console.log(`[QQ Music API] ========================================`)
console.log(`[QQ Music API] Starting...`)
console.log(`[QQ Music API] Port: ${port}`)
console.log(`[QQ Music API] Host: ${host}`)
console.log(`[QQ Music API] CWD: ${process.cwd()}`)
console.log(`[QQ Music API] NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`[QQ Music API] ========================================`)

async function start() {
  try {
    // 设置工作目录到用户数据目录，避免写入权限问题
    const userDataPath = process.env.USER_DATA || path.join(os.homedir(), '.luo-music')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    process.chdir(userDataPath)
    console.log(`[QQ Music API] Working directory changed to: ${userDataPath}`)
    
    // 设置环境变量
    process.env.PORT = String(port)
    process.env.HOST = host
    
    console.log('[QQ Music API] Loading module...')
    // 加载 QQ 音乐 API
    require('@sansenjian/qq-music-api')
    console.log('[QQ Music API] Module loaded successfully')
    
    console.log(`[QQ Music API] Server started, waiting for ready...`)
    
    // 等待确认服务真的启动了
    await waitForServer(port, host, 10000)
    
    console.log(`[QQ Music API] ✅ Server confirmed running on http://${host}:${port}`)
    
    // 通知父进程已就绪
    if (process.send) {
      process.send({ type: 'ready', port })
      console.log('[QQ Music API] Sent ready message to parent')
    }
  } catch (err) {
    console.error('[QQ Music API] ❌ Failed to start:', err.message)
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
    
    const check = () => {
      attempts++
      console.log(`[QQ Music API] Health check attempt ${attempts}...`)
      
      const req = http.request({
        host,
        port,
        path: '/',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        // 只要服务器能响应（即使 404），说明服务器已启动
        // QQ Music API 根路径返回 404 是正常的
        console.log(`[QQ Music API] Server responded with status: ${res.statusCode}`)
        console.log(`[QQ Music API] ✅ Server confirmed running on http://${host}:${port}`)
        resolve()
      })
      
      req.on('error', (err) => {
        console.log(`[QQ Music API] Health check failed: ${err.message}`)
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server did not start in ${timeout}ms`))
        } else {
          setTimeout(check, 500)
        }
      })
      
      req.on('timeout', () => {
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
