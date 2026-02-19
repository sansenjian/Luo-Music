import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

// 缓存 Express app 实例，避免每次请求重复初始化
let app = null
let initPromise = null
let initError = null

// 导出 Vercel Serverless Handler
export default async (req, res) => {
  // 设置 CORS 响应头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // 如果之前有初始化错误，直接返回
    if (initError) {
      console.error('Previous init error:', initError)
      return res.status(500).json({ 
        error: 'Service Initialization Failed',
        message: initError.message 
      })
    }

    // 初始化 API 服务
    if (!app && !initPromise) {
      console.log('Initializing NeteaseCloudMusicApi...')
      initPromise = serveNcmApi({
        checkVersion: false,
        port: 14533,
      }).then((expressApp) => {
        console.log('NeteaseCloudMusicApi initialized successfully')
        app = expressApp
        return expressApp
      }).catch((err) => {
        console.error('Failed to initialize NeteaseCloudMusicApi:', err)
        initError = err
        throw err
      })
    }

    // 等待初始化完成
    if (initPromise && !app) {
      await initPromise
    }

    if (!app) {
      return res.status(503).json({ 
        error: 'Service Unavailable',
        message: 'API service is not ready' 
      })
    }

    // 修复 Vercel 路径问题：去掉 /api 前缀
    const originalUrl = req.url
    if (req.url.startsWith('/api')) {
      req.url = req.url.replace(/^\/api(?=\/|$|\?)/, '')
    }

    // 如果替换后是空字符串，则补全为根路径
    if (req.url === '' || req.url.startsWith('?')) {
      req.url = '/' + req.url
    }
    
    console.log(`[API] ${req.method} ${originalUrl} -> ${req.url}`)
    
    // 将请求转发给 Express app
    return app(req, res)
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// 配置最大执行时间
export const config = {
  maxDuration: 10,
}
