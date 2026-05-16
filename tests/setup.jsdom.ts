import { config } from '@vue/test-utils'
import { beforeEach } from 'vitest'

import { createTestPinia, installMockAudio } from './setup.shared'

installMockAudio()

beforeEach(() => {
  const pinia = createTestPinia()
  config.global.plugins = [pinia]
})
