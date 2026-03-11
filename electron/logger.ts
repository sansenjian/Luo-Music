import { createRequire } from 'node:module';
import type * as SentryElectron from '@sentry/electron';

const require = createRequire(__filename);
const log = require('electron-log');

// 安全获取 electron app 对象
let app: { isPackaged?: boolean; getVersion?: () => string } | undefined;
try {
  const electron = require('electron');
  app = electron.app;
} catch {
  // 测试环境中 electron 可能不可用
  app = undefined;
}

// 配置 electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 自动按日期分割日志
// electron-log 默认文件名是 main.log，我们可以自定义或者依赖它的轮转
// 实际上 electron-log 默认不按日期分割文件，而是单个文件轮转。
// 如果要按日期，可以修改 fileName 格式。
const date = new Date().toISOString().split('T')[0];
log.transports.file.fileName = `main-${date}.log`;

// 初始化 Sentry (仅在生产环境或配置了 DSN 时)
const SENTRY_DSN = process.env.SENTRY_DSN;
let Sentry: typeof SentryElectron | null = null;

// 安全检查 app 对象
const isPackaged = app?.isPackaged ?? false;
const getVersion = app?.getVersion?.() ?? '0.0.0';

if (isPackaged && SENTRY_DSN) {
  try {
    Sentry = require('@sentry/electron') as typeof SentryElectron;
    Sentry.init({
      dsn: SENTRY_DSN,
      // 自动关联 release 版本号 (需要在构建时注入版本号，或者读取 package.json)
      release: `luo-music@${getVersion}`,
      environment: 'production',
    });
    log.info('Sentry initialized');
  } catch (error) {
    log.error('Failed to initialize Sentry', error);
  }
} else {
  log.info('Sentry skipped (dev mode or no DSN)');
}

export default log;
export { Sentry };
