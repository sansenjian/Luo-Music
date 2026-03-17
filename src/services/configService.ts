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

export type ConfigService = {
  get(): AppConfig
  getPort(name: keyof AppConfig['ports']): number
}

const DEFAULT_CONFIG: AppConfig = {
  env: {
    mode: import.meta.env.MODE,
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD
  },
  ports: {
    qq: 3200,
    netease: 14532
  }
}

export function createConfigService(): ConfigService {
  const config = { ...DEFAULT_CONFIG }

  return {
    get(): AppConfig {
      return config
    },
    getPort(name: keyof AppConfig['ports']): number {
      return config.ports[name]
    }
  }
}
