import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../electron.vite.config.ts'

async function resolveBaseConfig(env) {
  if (typeof baseConfig === 'function') {
    return await baseConfig(env)
  }

  return await baseConfig
}

export default defineConfig(async env => {
  const resolvedConfig = await resolveBaseConfig(env)
  const rendererConfig = resolvedConfig.renderer ?? {}
  const plugins = Array.isArray(rendererConfig.plugins)
    ? rendererConfig.plugins.filter(plugin => {
        return !plugin || !('name' in plugin) || !plugin.name.toLowerCase().includes('sentry')
      })
    : rendererConfig.plugins

  return mergeConfig(
    { ...rendererConfig, plugins },
    {
      build: {
        outDir: '.vite_cache/analyze/electron-renderer',
        emptyOutDir: true
      }
    }
  )
})
