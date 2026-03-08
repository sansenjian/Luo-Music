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
    console.error('Error starting API:', err);
    process.exit(1);
  }
}

// 启动 API 服务
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
