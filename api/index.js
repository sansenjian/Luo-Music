import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

// 缓存 Express app 实例，避免每次请求重复初始化
let app

// 导出 Vercel Serverless Handler
export default async (req, res) => {
  if (!app) {
    // serveNcmApi 返回 Promise，需要等待初始化完成
    app = await serveNcmApi({
      checkVersion: true,
    })
  }

  // 修复 Vercel 路径问题：去掉 /api 前缀，确保 API 路由正确匹配
  // 仅匹配 /api, /api/, /api?query, /api/path 等情况，避免误伤 /apixxx
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api(?=\/|$|\?)/, '')
  }

  // 如果替换后是空字符串（例如只请求了 /api）或仅包含查询字符串（例如 /api?foo=bar），则补全为带路径的形式
  if (req.url === '' || req.url.startsWith('?')) {
    req.url = '/' + req.url
  }
  
  // 将请求转发给 Express app
  return app(req, res)
}
