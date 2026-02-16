const { serveNcmApi } = require('NeteaseCloudMusicApi')

serveNcmApi({
  port: 3000,
  host: 'localhost',
})
  .then(() => {
    console.log('NeteaseCloudMusicApi 服务已启动在 http://localhost:3000')
  })
  .catch((err) => {
    console.error('启动失败:', err)
    process.exit(1)
  })
