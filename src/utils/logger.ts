// 声明 window.electronAPI 的类型
declare global {
  interface Window {
    electronAPI?: {
      send: (channel: string, data?: unknown) => void;
    }
  }
}

class Logger {
  private static instance: Logger;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private isDev(): boolean {
    return import.meta.env.DEV;
  }

  private formatMessage(module: string, message: string, data?: unknown): string {
    const timestamp = new Date().toLocaleTimeString();
    let msg = `[${timestamp}] [${module}] ${message}`;
    if (data) {
      try {
        msg += ` ${JSON.stringify(data)}`;
      } catch (e) {
        msg += ` [Data Circular]`;
      }
    }
    return msg;
  }

  private sendToMain(level: 'info' | 'warn' | 'error' | 'debug', module: string, message: string, data?: unknown) {
    if (window.electronAPI) {
      window.electronAPI.send('log-message', {
        level,
        module,
        message,
        data
      });
    }
  }

  public info(module: string, message: string, data?: unknown) {
    // 开发模式：控制台输出
    if (this.isDev()) {
      console.info(`%c [INFO] [${module}] ${message}`, 'color: #2196F3', data || '');
    }
    // 始终发送给主进程记录文件
    this.sendToMain('info', module, message, data);
  }

  public warn(module: string, message: string, data?: unknown) {
    if (this.isDev()) {
      console.warn(`%c [WARN] [${module}] ${message}`, 'color: #FF9800', data || '');
    }
    this.sendToMain('warn', module, message, data);
  }

  public error(module: string, message: string, data?: unknown) {
    if (this.isDev()) {
      console.error(`%c [ERROR] [${module}] ${message}`, 'color: #F44336', data || '');
    }
    this.sendToMain('error', module, message, data);
  }

  public debug(module: string, message: string, data?: unknown) {
    if (this.isDev()) {
      console.debug(`%c [DEBUG] [${module}] ${message}`, 'color: #9E9E9E', data || '');
    }
    // Debug 级别日志默认也记录，或者根据配置决定
    this.sendToMain('debug', module, message, data);
  }
}

export const logger = Logger.getInstance();
