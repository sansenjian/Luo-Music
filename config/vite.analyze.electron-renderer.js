import { defineConfig, mergeConfig } from 'vite'

import baseConfig, { ANALYZE_EXCLUDE_PLUGIN_MARKER } from '../electron.vite.config.ts'

async function resolveBaseConfig(env) {
  if (typeof baseConfig === 'function') {
    return await baseConfig(env)
  }

  return await baseConfig
}

function flattenPlugins(plugins) {
  return plugins.flatMap(plugin => {
    if (Array.isArray(plugin)) {
      return flattenPlugins(plugin)
    }

    return [plugin]
  })
}

export default defineConfig(async env => {
  const resolvedConfig = await resolveBaseConfig(env)
  const rendererConfig = resolvedConfig.renderer ?? {}
  const plugins = Array.isArray(rendererConfig.plugins)
    ? flattenPlugins(rendererConfig.plugins).filter(plugin => {
        return (
          !plugin ||
          typeof plugin !== 'object' ||
          Array.isArray(plugin) ||
          !(ANALYZE_EXCLUDE_PLUGIN_MARKER in plugin)
        )
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
