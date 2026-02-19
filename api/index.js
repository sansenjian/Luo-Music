import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

// 缓存 Express app 实例，避免每次请求重复初始化
let app
let initPromise = null

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
    if (!app) {
      // 防止并发初始化
      if (!initPromise) {
        initPromise = serveNcmApi({
          checkVersion: false, // 禁用版本检查，避免冷启动延迟
          port: 14533, // 使用不同端口避免冲突
        })
      }
      app = await initPromise
    }

    // 修复 Vercel 路径问题：去掉 /api 前缀
    if (req.url.startsWith('/api')) {
      req.url = req.url.replace(/^\/api(?=\/|$|\?)/, '')
    }

    // 如果替换后是空字符串，则补全为根路径
    if (req.url === '' || req.url.startsWith('?')) {
      req.url = '/' + req.url
    }
    
    // 将请求转发给 Express app
    return app(req, res)
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    })
  }
}

// 配置最大执行时间
export const config = {
  maxDuration: 10, // Vercel 免费版最大 10 秒
}
