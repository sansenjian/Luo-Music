import Koa from 'koa'

type ServeNcmApiOptions = {
  port: number
  host: string
  checkVersion: boolean
}

type NeteaseApiModule = {
  serveNcmApi?: (options: ServeNcmApiOptions) => Promise<void>
  default?: {
    serveNcmApi?: (options: ServeNcmApiOptions) => Promise<void>
    server?: {
      serveNcmApi?: (options: ServeNcmApiOptions) => Promise<void>
    }
  }
}

const app = new Koa()

// 启动网易云 API
const NCM_PORT = Number(process.env.NCM_PORT || 14532)
const serverStartedAt = Date.now()

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

function logStartupTiming(label: string, startedAt: number): void {
  const elapsed = Date.now() - startedAt
  const total = Date.now() - serverStartedAt
  console.log(
    `[server:timing] ${label}: ${formatDuration(elapsed)} (total ${formatDuration(total)})`
  )
}

async function startNeteaseApi() {
  try {
    const importStartedAt = Date.now()
    const apiModule = (await import('@neteasecloudmusicapienhanced/api')) as NeteaseApiModule
    logStartupTiming('import @neteasecloudmusicapienhanced/api', importStartedAt)

    const resolveStartedAt = Date.now()
    const serveNcmApi =
      apiModule.serveNcmApi ??
      apiModule.default?.serveNcmApi ??
      apiModule.default?.server?.serveNcmApi
    logStartupTiming('resolve serveNcmApi export', resolveStartedAt)

    if (!serveNcmApi) {
      console.error('Failed to resolve serveNcmApi from @neteasecloudmusicapienhanced/api')
      process.exit(1)
      return
    }

    const serveStartedAt = Date.now()
    await serveNcmApi({
      port: NCM_PORT,
      host: 'localhost',
      checkVersion: false
    })
    logStartupTiming('start Netease API server', serveStartedAt)
    console.log(`Netease Cloud Music API started at http://localhost:${NCM_PORT}`)
    console.log(`[server:timing] total startup: ${formatDuration(Date.now() - serverStartedAt)}`)
  } catch (err) {
    console.error(`[server:timing] failed after ${formatDuration(Date.now() - serverStartedAt)}`)
    console.error('Error starting Netease API:', err)
    process.exit(1)
  }
}

// 注意：QQ 音乐 API (@sansenjian/qq-music-api) 与 Node 24 存在兼容性问题
// 如需使用 QQ 音乐，请使用 scripts/dev/qq-api-server.cjs 单独启动
// async function startQQMusicApi() { ... }

// 启动网易云 API
void startNeteaseApi()

// Koa 服务配置 (如果需要)
// app.use(...);

// 如果需要同时运行 Koa 服务，可以取消注释并设置端口
// const KOA_PORT = process.env.PORT || 3000;
// app.listen(KOA_PORT, () => {
//   console.log(`Koa Server running on port ${KOA_PORT}`);
// });

// 导出 app 用于测试或集成
export default app
