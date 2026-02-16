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
  
  // 将请求转发给 Express app
  return app(req, res)
}
