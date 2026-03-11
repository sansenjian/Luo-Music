import Koa from 'koa';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { serveNcmApi } = require('@neteasecloudmusicapienhanced/api');

const app = new Koa();

// 启动网易云 API
const NCM_PORT = Number(process.env.NCM_PORT || 14532);

async function startNeteaseApi() {
  try {
    await serveNcmApi({
      port: NCM_PORT,
      host: 'localhost',
      checkVersion: false,
    });
    console.log(`Netease Cloud Music API started at http://localhost:${NCM_PORT}`);
  } catch (err) {
    console.error('Error starting Netease API:', err);
    process.exit(1);
  }
}

// 注意：QQ 音乐 API (@sansenjian/qq-music-api) 与 Node 24 存在兼容性问题
// 如需使用 QQ 音乐，请使用 scripts/dev/qq-api-server.cjs 单独启动
// async function startQQMusicApi() { ... }

// 启动网易云 API
startNeteaseApi();

// Koa 服务配置 (如果需要)
// app.use(...);

// 如果需要同时运行 Koa 服务，可以取消注释并设置端口
// const KOA_PORT = process.env.PORT || 3000;
// app.listen(KOA_PORT, () => {
//   console.log(`Koa Server running on port ${KOA_PORT}`);
// });

// 导出 app 用于测试或集成
export default app;
