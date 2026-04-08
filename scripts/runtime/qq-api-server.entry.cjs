const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const port = process.env.PORT || 3200
const host = process.env.HOST || '127.0.0.1'

console.log('[QQ Music API] ========================================')
console.log('[QQ Music API] Starting...')
console.log(`[QQ Music API] Port: ${port}`)
console.log(`[QQ Music API] Host: ${host}`)
console.log(`[QQ Music API] CWD: ${process.cwd()}`)
console.log(`[QQ Music API] NODE_ENV: ${process.env.NODE_ENV}`)
console.log('[QQ Music API] ========================================')

async function start() {
  try {
    const userDataPath = process.env.USER_DATA || path.join(os.homedir(), '.luo-music')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    process.chdir(userDataPath)
    console.log(`[QQ Music API] Working directory changed to: ${userDataPath}`)

    process.env.PORT = String(port)
    process.env.HOST = host

    console.log('[QQ Music API] Loading bundled module...')
    const qqApiModule = require('@sansenjian/qq-music-api/dist/app.js')
    const { handleQQSearchRequest } = require('../dev/qq-search-fallback.cjs')
    const qqApiApp = qqApiModule && (qqApiModule.default || qqApiModule)
    if (
      !qqApiApp ||
      typeof qqApiApp.listen !== 'function' ||
      typeof qqApiApp.callback !== 'function'
    ) {
      throw new Error('Invalid QQ Music API app export')
    }

    const appCallback = qqApiApp.callback()
    const server = http.createServer(async (req, res) => {
        try {
          const handled = await handleQQSearchRequest(req, res)
          if (!handled) {
            appCallback(req, res)
          }
        } catch (err) {
          console.error('[QQ Music API] Unhandled request error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        }
      })

    await new Promise((resolve, reject) => {
      const onListening = () => {
        server.off('error', onError)
        console.log(`[QQ Music API] Koa app listening on http://${host}:${port}`)
        resolve()
      }
      const onError = error => {
        server.off('listening', onListening)
        reject(error)
      }

      server.once('listening', onListening)
      server.once('error', onError)
      server.listen(Number(port), host)
      })

    console.log('[QQ Music API] Bundled module loaded successfully')
    await waitForServer(port, host, 10000)

    if (process.send) {
      process.send({ type: 'ready', port })
      console.log('[QQ Music API] Sent ready message to parent')
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('[QQ Music API] Failed to start:', error.message)
    console.error(error.stack)

    if (process.send) {
      process.send({ type: 'error', error: error.message })
    }

    process.exit(1)
  }
}

function waitForServer(portValue, hostValue, timeout) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let attempts = 0
    let resolved = false

    const check = () => {
      if (resolved) return
      attempts++
      console.log(`[QQ Music API] Health check attempt ${attempts}...`)

      const req = http.request(
        {
          host: hostValue,
          port: portValue,
          path: '/',
          method: 'GET',
          timeout: 2000
        },
        res => {
          if (resolved) return
          resolved = true
          console.log(`[QQ Music API] Server responded with status: ${res.statusCode}`)
          resolve()
        }
      )

      req.on('error', err => {
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
