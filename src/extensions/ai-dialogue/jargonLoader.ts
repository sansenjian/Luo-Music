/**
 * 黑话插件加载器
 *
 * 动态加载内置黑话学习插件，遵循与 BuiltInAdapterLoader 相同的 glob 模式。
 * 播放器通过此加载器获取 JargonProvider 实例，不直接依赖具体实现。
 *
 * 若无可用插件，返回 noop provider（不学习、不推断）。
 */

import type { JargonProvider } from './jargonProvider'

// 动态扫描内置黑话插件（与 BuiltInAdapterLoader 的 glob 模式一致）
const moduleLoaders = import.meta.glob('../../../../plugins/built-in/jargon-learner/index.ts')

let providerPromise: Promise<JargonProvider> | null = null

/** noop 提供者：无插件时的安全回退 */
const noopProvider: JargonProvider = {
  async extract() {
    return { jargons: [] }
  },
  async infer() {
    return { isJargon: false, meaning: '' }
  }
}

/**
 * 获取黑话学习提供者
 * 首次调用时加载插件，后续返回缓存
 */
export function getJargonProvider(): Promise<JargonProvider> {
  if (providerPromise) return providerPromise

  providerPromise = (async () => {
    const loader = moduleLoaders['../../../../plugins/built-in/jargon-learner/index.ts']
    if (!loader) {
      return noopProvider
    }

    try {
      const mod = (await loader()) as { default?: JargonProvider; jargonProvider?: JargonProvider }
      return mod.default ?? mod.jargonProvider ?? noopProvider
    } catch {
      return noopProvider
    }
  })()

  return providerPromise
}
