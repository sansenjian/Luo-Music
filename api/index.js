import fs from 'fs'
import os from 'os'
import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

// 确保临时目录存在
try {
  const tmp = os.tmpdir()
  fs.mkdirSync(tmp, { recursive: true })
} catch (e) {}

// 初始化 Express app 一次
const app = serveNcmApi({
  checkVersion: true,
})

// 导出 Vercel Serverless Handler
export default (req, res) => {
  return app(req, res)
}
