import { createPluginContext } from '@plugin-sdk/runtime'
import type { MusicPluginDefinition, PluginContext } from '@plugin-sdk'
import type { MusicPlatformAdapter } from '@/platform/music/interface'
import { createPluginAdapterBridge } from './PluginAdapterBridge'

type BuiltInPluginModule = {
  default?: MusicPluginDefinition
}

type BuiltInPluginLoaderMap = Record<string, () => Promise<BuiltInPluginModule>>

function extractPlatformId(modulePath: string): string {
  const match = modulePath.match(/built-in\/([^/]+)\/index\.ts$/)

  if (!match) {
    throw new Error(`Unable to resolve built-in plugin platform id from path: ${modulePath}`)
  }

  return match[1]
}

function createModuleLoaders(): BuiltInPluginLoaderMap {
  const modules = import.meta.glob('../../../../plugins/built-in/*/index.ts') as Record<
    string,
    () => Promise<BuiltInPluginModule>
  >

  return Object.fromEntries(
    Object.entries(modules).map(([modulePath, loader]) => [extractPlatformId(modulePath), loader])
  )
}

function resolvePluginDefinition(
  platformId: string,
  module: BuiltInPluginModule
): MusicPluginDefinition {
  const definition = module.default

  if (!definition) {
    throw new Error(`Built-in plugin module "${platformId}" is missing a default export`)
  }

  if (definition.manifest.platformId !== platformId) {
    throw new Error(
      `Built-in plugin module "${platformId}" resolved mismatched manifest platformId "${definition.manifest.platformId}"`
    )
  }

  return definition
}

const defaultModuleLoaders = createModuleLoaders()

export interface BuiltInAdapterLoaderDeps {
  moduleLoaders?: BuiltInPluginLoaderMap
  createContext?: (platformId: string) => PluginContext
}

export class BuiltInAdapterLoader {
  private readonly adapterPromises = new Map<string, Promise<MusicPlatformAdapter>>()

  constructor(private readonly deps: BuiltInAdapterLoaderDeps = {}) {}

  private get moduleLoaders(): BuiltInPluginLoaderMap {
    return this.deps.moduleLoaders ?? defaultModuleLoaders
  }

  private getContext(platformId: string): PluginContext {
    return this.deps.createContext?.(platformId) ?? createPluginContext(platformId)
  }

  supports(platformId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.moduleLoaders, platformId)
  }

  async load(platformId: string): Promise<MusicPlatformAdapter> {
    if (!this.supports(platformId)) {
      throw new Error(`Built-in plugin "${platformId}" is not registered`)
    }

    const existingAdapterPromise = this.adapterPromises.get(platformId)
    if (existingAdapterPromise) {
      return existingAdapterPromise
    }

    const adapterPromise = this.moduleLoaders[platformId]()
      .then(module => resolvePluginDefinition(platformId, module))
      .then(definition =>
        createPluginAdapterBridge(definition, {
          context: this.getContext(platformId)
        })
      )
      .catch(error => {
        this.adapterPromises.delete(platformId)
        throw error
      })

    this.adapterPromises.set(platformId, adapterPromise)
    return adapterPromise
  }
}

export const builtInAdapterLoader = new BuiltInAdapterLoader()
