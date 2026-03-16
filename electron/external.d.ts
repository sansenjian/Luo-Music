declare module '@sansenjian/qq-music-api' {
  export function serveQcmApi(options: { port: number; host: string }): Promise<void>
  const api: {
    serveQcmApi?: typeof serveQcmApi
  }
  export default api
}

declare module 'koa' {
  export default class Koa {
    use(...args: unknown[]): this
    listen(...args: unknown[]): unknown
  }
}

// Extend Electron Forge packager config to include asarUnpack
// This property is supported by electron-packager but missing from Forge types
interface PackagerConfigWithAsar {
  asarUnpack?: string[]
}
