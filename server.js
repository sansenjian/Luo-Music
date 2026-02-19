import pkg from 'NeteaseCloudMusicApi'
const { serveNcmApi } = pkg

serveNcmApi({
  port: 14532,
  host: 'localhost',
})
  .then(() => {
    console.log('NeteaseCloudMusicApi 服务已启动在 http://localhost:14532')
  })
  .catch((err) => {
    console.error('启动失败:', err)
    process.exit(1)
  })
