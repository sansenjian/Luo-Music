import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../vite.config.ts'

async function resolveBaseConfig(env) {
  if (typeof baseConfig === 'function') {
    return await baseConfig(env)
  }

  return await baseConfig
}

export default defineConfig(async env => {
  const resolvedConfig = await resolveBaseConfig(env)

  return mergeConfig(resolvedConfig, {
    build: {
      outDir: '.vite_cache/analyze/web',
      emptyOutDir: true
    }
  })
})
