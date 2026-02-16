import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

// 初始化 API 实例（在模块作用域中执行，以便复用）
// 这样可以避免每次请求都重新创建 Express app，减少冷启动开销
const api = serveNcmApi({
  checkVersion: true,
})

// 导出 Vercel Serverless Handler
export default (req, res) => {
  // NeteaseCloudMusicApi 的 serveNcmApi 返回的是一个 Express app
  // 我们需要把它转接给 Vercel 的 req/res
  return api(req, res)
}
