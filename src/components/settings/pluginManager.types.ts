import type { PluginCategory } from '@plugin-sdk'

export interface PluginCategoryTab {
  value: PluginCategory
  label: string
  description: string
  emptyTitle: string
  emptyDescription: string
}
