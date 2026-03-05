/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC: string
  readonly VITE_DEV_SERVER_URL: string
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
