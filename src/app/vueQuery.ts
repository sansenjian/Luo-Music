import type { App } from 'vue'

import { getLogger } from '@/utils/logger'

let vueQueryPluginInstalled = false
let vueQueryPluginPromise: Promise<void> | null = null

export async function ensureVueQueryPlugin(app: App): Promise<void> {
  if (vueQueryPluginInstalled) {
    return
  }

  if (!vueQueryPluginPromise) {
    vueQueryPluginPromise = import('@tanstack/vue-query')
      .then(({ VueQueryPlugin }) => {
        if (vueQueryPluginInstalled) {
          return
        }

        app.use(VueQueryPlugin)
        vueQueryPluginInstalled = true
      })
      .catch(error => {
        getLogger().error('Main', 'Failed to install Vue Query plugin', error)
      })
      .finally(() => {
        if (!vueQueryPluginInstalled) {
          vueQueryPluginPromise = null
        }
      })
  }

  await vueQueryPluginPromise
}
