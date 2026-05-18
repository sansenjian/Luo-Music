import { NETEASE_API_PORT, QQ_API_PORT } from '@/constants/http'

export type AppConfig = {
  env: {
    mode: string
    isDev: boolean
    isProd: boolean
  }
  ports: {
    qq: number
    netease: number
  }
}

export type ServiceName = keyof AppConfig['ports']

export type ConfigService = {
  get(): AppConfig
  getPort(name: ServiceName): number
  getServiceBaseUrl(name: ServiceName, port?: number): string
}

const DEFAULT_CONFIG: AppConfig = {
  env: {
    mode: import.meta.env.MODE,
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD
  },
  ports: {
    qq: QQ_API_PORT,
    netease: NETEASE_API_PORT
  }
}

export function createConfigService(): ConfigService {
  const config = { ...DEFAULT_CONFIG }

  return {
    get(): AppConfig {
      return config
    },
    getPort(name: ServiceName): number {
      return config.ports[name]
    },
    getServiceBaseUrl(name: ServiceName, port: number = config.ports[name]): string {
      return `http://127.0.0.1:${port}`
    }
  }
}
