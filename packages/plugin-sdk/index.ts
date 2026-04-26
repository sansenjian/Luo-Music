import type { MusicPluginDefinition } from './types'

export * from './types'
export * from './runtime'

export function defineMusicPlugin<T extends MusicPluginDefinition>(definition: T): T {
  return definition
}
