// Vercel Serverless Function entry point
const fs = require('fs')
const path = require('path')
const tmp = require('os').tmpdir()
const { serveNcmApi } = require('NeteaseCloudMusicApi')

// 确保临时目录存在
try {
  fs.mkdirSync(tmp, { recursive: true })
} catch (e) {}

// 导出 Vercel Serverless Handler
module.exports = async (req, res) => {
  const api = serveNcmApi({
    checkVersion: true,
  })
  
  // NeteaseCloudMusicApi 的 serveNcmApi 返回的是一个 Express app
  // 我们需要把它转接给 Vercel 的 req/res
  return api(req, res)
}
